/**
 * Generate `src/app/styles/tokens.gen.css` from the front matter of `DESIGN.md`.
 *
 * bun run design           write the file
 * bun run design --check   fail if writing would change it
 *
 * Light only. The `.dark` block in `src/app/index.css` is not modelled.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";
import { parse } from "yaml";

const Text = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite]));
const Typography = Schema.Record(Schema.String, Text);

const Tokens = Schema.Struct({
	colors: Text,
	typography: Typography,
	rounded: Text,
	spacing: Text,
	containers: Text,
	motion: Text,
});

type Tokens = typeof Tokens.Type;

const HEADER = "/* Generated from DESIGN.md by bun run design. Do not edit. */";

/** The YAML front matter of a markdown file, as text. */
export function frontMatter(markdown: string): string {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
	return match?.[1] ?? "";
}

const TYPE_PARTS: ReadonlyArray<readonly [string, string]> = [
	["fontSize", ""],
	["lineHeight", "--line-height"],
	["fontWeight", "--font-weight"],
	["letterSpacing", "--letter-spacing"],
];

const factor = (value: number, base: number): string =>
	String(Math.round((value / base) * 100) / 100);

const rem = (text: string | number): number => Number.parseFloat(String(text));

/** The `bun run design` output for the tokens in `markdown`. */
export function generate(markdown: string): string {
	const tokens: Tokens = Schema.decodeUnknownSync(Tokens)(parse(frontMatter(markdown)));
	const lines: string[] = [HEADER, "", ":root {"];
	for (const [name, value] of Object.entries(tokens.colors)) lines.push(`\t--${name}: ${value};`);
	const base = rem(tokens.rounded["lg"] ?? 0);
	lines.push(`\t--radius: ${tokens.rounded["lg"]};`);
	for (const [name, value] of Object.entries(tokens.motion)) {
		if (name.startsWith("duration-")) lines.push(`\t--${name}: ${value};`);
	}
	lines.push("}", "");

	lines.push("/* Radius follows `--radius`, which a sidebar overrides for its subtree. */");
	lines.push("@theme inline {");
	for (const [name, value] of Object.entries(tokens.rounded)) {
		if (name === "pill") lines.push(`\t--radius-${name}: ${value};`);
		else {
			const by = factor(rem(value), base);
			lines.push(
				`\t--radius-${name}: ${by === "1" ? "var(--radius)" : `calc(var(--radius) * ${by})`};`,
			);
		}
	}
	lines.push("}", "", "@theme {");
	for (const [name, value] of Object.entries(tokens.spacing)) {
		lines.push(`\t--spacing-${name}: ${value};`);
	}
	for (const [name, value] of Object.entries(tokens.containers)) {
		lines.push(`\t--container-${name}: ${value};`);
	}
	for (const [name, parts] of Object.entries(tokens.typography)) {
		for (const [key, suffix] of TYPE_PARTS) {
			const value = parts[key];
			if (value !== undefined) lines.push(`\t--text-${name}${suffix}: ${value};`);
		}
	}
	for (const [name, value] of Object.entries(tokens.motion)) {
		if (name.startsWith("ease-")) lines.push(`\t--${name}: ${value};`);
	}
	lines.push("}", "");
	for (const [name, value] of Object.entries(tokens.motion)) {
		if (name.startsWith("duration-")) {
			lines.push(`@utility ${name} {`, `\ttransition-duration: ${value};`, "}");
		}
	}
	return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
	const root = join(import.meta.dir, "..");
	const out = join(root, "src/app/styles/tokens.gen.css");
	const next = generate(readFileSync(join(root, "DESIGN.md"), "utf8"));
	if (process.argv.includes("--check")) {
		let current = "";
		try {
			current = readFileSync(out, "utf8");
		} catch {
			current = "";
		}
		if (current !== next) {
			console.error("tokens.gen.css is out of date with DESIGN.md. Run: bun run design");
			process.exit(1);
		}
	} else {
		writeFileSync(out, next);
	}
}
