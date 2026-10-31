/** Pure matching for the `design-tokens` rule: which Tailwind classes step outside the tokens. */

export type TokenCategory = "bracket" | "palette" | "textSize" | "spacing";

export type TokenViolation = {
  category: TokenCategory;
  /** The class as written, variants included. */
  className: string;
  /** One line naming the class and the token to use instead. */
  message: string;
};

export const defaultAllowed: readonly string[] = ["grid-cols-[minmax(0,1fr)]"];

const spacingSteps = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
const spacingNames = ["pane", "page", "row", "field", "card", "section", "auto", "px"];
const spacingUtilities = "gap-x|gap-y|space-x|space-y|gap|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m";

const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const colorUtilities =
  "text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder";

const paletteClass = new RegExp(`^(?:${colorUtilities})-(?:(?:${palette})-\\d+|black|white)(?:/.+)?$`);
const textSizeClass = /^text-(xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
const spacingClass = new RegExp(`^(?:${spacingUtilities})-(\\d+(?:\\.\\d+)?)$`);

const textRoles: Record<string, string> = {
  xs: "text-meta",
  sm: "text-body",
  base: "text-body",
  lg: "text-title",
  xl: "text-title",
};

/** Split on whitespace, keeping bracketed groups (which may hold spaces as underscores only) whole. */
function splitClasses(text: string): string[] {
  return text.split(/\s+/).filter((part) => part !== "");
}

/** The utility after its variant prefixes; colons inside brackets belong to a variant or value. */
function stripVariants(token: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start);
}

function nearestStep(value: number): number {
  let best = spacingSteps[0] ?? 0;
  for (const step of spacingSteps) {
    if (Math.abs(step - value) < Math.abs(best - value)) best = step;
  }
  return best;
}

/** Violations among the whitespace-separated classes in one string. */
export function findTokenViolations(
  text: string,
  allowed: readonly string[] = defaultAllowed,
): TokenViolation[] {
  const found: TokenViolation[] = [];
  for (const token of splitClasses(text)) {
    const utility = stripVariants(token).replace(/^!/, "").replace(/!$/, "");
    const bare = utility.replace(/^-/, "");
    const report = (category: TokenCategory, message: string): void => {
      found.push({ category, className: token, message });
    };

    if (utility.includes("[")) {
      if (allowed.includes(utility)) continue;
      report(
        "bracket",
        `\`${utility}\` is an arbitrary value; use a design token (add one in tokens.css) or a documented exception.`,
      );
      continue;
    }
    if (paletteClass.test(bare)) {
      report(
        "palette",
        `\`${utility}\` is a raw palette colour; use a semantic colour token such as bg-background, text-foreground or border-border.`,
      );
      continue;
    }
    const size = textSizeClass.exec(bare);
    if (size?.[1] !== undefined) {
      const key = size[1];
      const role = textRoles[key] ?? "text-display";
      report("textSize", `\`${utility}\` is outside the type scale; use \`${role}\`.`);
      continue;
    }
    const spacing = spacingClass.exec(bare);
    if (spacing?.[1] !== undefined) {
      const value = Number(spacing[1]);
      if (spacingSteps.includes(value)) continue;
      const prefix = bare.slice(0, bare.length - spacing[1].length);
      report(
        "spacing",
        `\`${utility}\` is not an allowed spacing step; use \`${prefix}${nearestStep(value)}\` or a named token (${spacingNames.join(", ")}).`,
      );
    }
  }
  return found;
}
