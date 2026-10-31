/**
 * Pure reads of a skill body: how big it is and which markdown links it holds.
 * The editor shows them as it is typed; the next step checks the relative links
 * against the skill folder's files.
 */

/** One `[text](target)` or `![alt](target)` found in prose. */
export type BodyLink = {
	text: string;
	/** The destination as written, without `<>` brackets or a title. */
	target: string;
	/** The 1-based line the link starts on. */
	line: number;
	/** Offsets of the destination in the body, so a mark can sit on it. */
	from: number;
	to: number;
	image: boolean;
};

/** A link that points into the skill folder: no scheme, no `#`, not protocol-relative. */
export const isRelativeTarget = (target: string): boolean =>
	target !== "" &&
	!target.startsWith("#") &&
	!target.startsWith("//") &&
	!/^[a-z][a-z0-9+.-]*:/i.test(target);

/** The file path a relative target names, without a `#fragment` or `?query`. */
export const relativeTargetPath = (target: string): string => {
	const cut = target.search(/[?#]/);
	const path = cut === -1 ? target : target.slice(0, cut);
	try {
		return decodeURI(path);
	} catch {
		return path;
	}
};

// Text, then a destination: `<...>` or a run without spaces, then an optional title.
const LINK =
	/(!?)\[((?:[^\][\\]|\\.)*)\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;

const blank = (text: string) => text.replace(/[^\n]/g, " ");

/** Blank out fenced code with spaces, keeping every offset and newline. */
export const blankFencedCode = (body: string): string =>
	body.replace(
		/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm,
		blank,
	);

const INLINE_CODE = /(`+)[^`][\s\S]*?\1(?!`)/g;

/** Blank out fenced and inline code with spaces, keeping every offset and newline. */
const maskCode = (body: string): string => blankFencedCode(body).replace(INLINE_CODE, blank);

/** The `[from, to)` offsets of every inline code span outside fenced code. */
export const inlineCodeSpans = (body: string): { from: number; to: number }[] =>
	[...blankFencedCode(body).matchAll(INLINE_CODE)].map((match) => ({
		from: match.index,
		to: match.index + match[0].length,
	}));

/** Every inline markdown link outside code, in document order. */
export const bodyLinks = (body: string): BodyLink[] => {
	const masked = maskCode(body);
	const links: BodyLink[] = [];
	for (const match of masked.matchAll(LINK)) {
		const raw = match[3] ?? "";
		const bracketed = raw.startsWith("<");
		const target = bracketed ? raw.slice(1, -1) : raw;
		const offset =
			match.index + match[0].indexOf(raw, (match[1]?.length ?? 0) + (match[2]?.length ?? 0) + 2);
		const from = offset + (bracketed ? 1 : 0);
		links.push({
			text: match[2] ?? "",
			target,
			line: masked.slice(0, match.index).split("\n").length,
			from,
			to: from + target.length,
			image: match[1] === "!",
		});
	}
	return links;
};

/** The links that point at files in the skill folder. */
export const relativeBodyLinks = (body: string): BodyLink[] =>
	bodyLinks(body).filter((link) => isRelativeTarget(link.target));

/** Lines and characters of a body; an empty body has no lines. */
export const bodySize = (body: string) =>
	({
		lines: body === "" ? 0 : body.replace(/\n$/, "").split("\n").length,
		characters: body.length,
	}) satisfies { lines: number; characters: number };

/**
 * The path a relative link names inside the skill folder, with `.` and `..`
 * resolved and any fragment or query dropped. Undefined when it climbs out of
 * the folder or names nothing but the folder itself.
 */
export const resolveBodyLinkPath = (target: string): string | undefined => {
	const resolved: string[] = [];
	for (const segment of relativeTargetPath(target).split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (resolved.pop() === undefined) return undefined;
		} else resolved.push(segment);
	}
	return resolved.length === 0 ? undefined : resolved.join("/");
};

/** The links whose target is neither a file nor a folder of `files` (paths relative to the skill). */
export const missingBodyLinks = (body: string, files: ReadonlySet<string>): BodyLink[] => {
	const folders = new Set<string>();
	for (const path of files) {
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
	}
	return relativeBodyLinks(body).filter((link) => {
		const path = resolveBodyLinkPath(link.target);
		return path === undefined || !(files.has(path) || folders.has(path));
	});
};
