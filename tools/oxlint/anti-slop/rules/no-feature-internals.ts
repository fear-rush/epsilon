import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type Options = {
  /** Repository-relative directory whose children are features, such as `server/src/features`. */
  root: string;
  /** Repository-relative directory that the `@/` alias points at; omit when there is no alias. */
  aliasRoot: string | undefined;
  /** Feature-relative paths other features may import, such as `settings/kit`. */
  open: string[];
};

const repository = resolve(import.meta.dirname, "../../../..");

function readOptions(raw: unknown): Options | null {
  if (typeof raw !== "object" || raw === null || !("root" in raw)) return null;
  if (typeof raw.root !== "string") return null;
  const aliasRoot =
    "aliasRoot" in raw && typeof raw.aliasRoot === "string" ? raw.aliasRoot : undefined;
  const open =
    "open" in raw && Array.isArray(raw.open)
      ? raw.open.filter((entry): entry is string => typeof entry === "string")
      : [];
  return { root: raw.root, aliasRoot, open };
}

/** The feature and the path inside it that `target` names, or null outside the features root. */
function locate(root: string, target: string): { feature: string; rest: string } | null {
  const inside = relative(root, target);
  if (inside.startsWith("..") || isAbsolute(inside)) return null;
  const [feature = "", ...rest] = inside.split(sep);
  return feature === "" ? null : { feature, rest: rest.join("/") };
}

function isPublic(feature: string, rest: string, open: string[]): boolean {
  if (rest === "" || /^index(\.[a-z]+)?$/.test(rest)) return true;
  const full = `${feature}/${rest}`;
  return open.some((entry) => full === entry || full.startsWith(`${entry}/`));
}

/** Keep features independent: another feature is reached only through its `index` or an open path. */
export const noFeatureInternalsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing another feature's internal files; import its index.ts instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          aliasRoot: { type: "string" },
          open: { type: "array", items: { type: "string" } },
        },
        required: ["root"],
        additionalProperties: false,
      },
    ],
    messages: {
      internal:
        "`{{source}}` reaches inside feature `{{feature}}`. Import `{{feature}}/index.ts` (export what is needed there) or move the shared piece to `platform/` or `lib/`.",
    },
  },
  createOnce(context) {
    function check(node: ESTree.Node, specifier: unknown): void {
      const options = readOptions(context.options[0]);
      if (options === null || typeof specifier !== "string") return;
      const root = resolve(repository, options.root);
      const own = locate(root, context.filename);
      if (own === null) return;
      let target: string | null = null;
      if (specifier.startsWith(".")) {
        target = resolve(dirname(context.filename), specifier);
      } else if (specifier.startsWith("@/") && options.aliasRoot !== undefined) {
        target = resolve(repository, options.aliasRoot, specifier.slice(2));
      }
      if (target === null) return;
      const other = locate(root, target);
      if (other === null || other.feature === own.feature) return;
      if (isPublic(other.feature, other.rest, options.open)) return;
      context.report({
        node,
        messageId: "internal",
        data: { source: specifier, feature: other.feature },
      });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
    };
  },
});
