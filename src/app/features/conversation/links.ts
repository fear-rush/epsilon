/** A link the agent used in a reply, with the words it wrote around it. */
export type ReplySource = {
	readonly url: string;
	readonly title: string;
};

const MARKDOWN_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const FENCE = /^\s*(?:```|~~~)/;

/** A URL's host, the fallback title for a link whose words are empty. */
const hostOf = (url: string): string => {
	const host = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
	if (host === undefined || host === "") return url;
	return host.replace(/^www\./, "");
};

/**
 * The external links in one reply, deduplicated by URL and in the order they appear.
 * Links inside a fenced block are code, not sources, so they are skipped; an image is
 * not a source either, so a `!` before the bracket keeps it out.
 */
export function sourcesOf(text: string): ReadonlyArray<ReplySource> {
	const found = new Map<string, string>();
	let fenced = false;

	for (const line of text.split("\n")) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		for (const match of line.matchAll(MARKDOWN_LINK)) {
			const url = match[2];
			if (url === undefined) continue;
			if (match.index > 0 && line[match.index - 1] === "!") continue;
			const words = (match[1] ?? "").trim();
			if (!found.has(url)) found.set(url, words === "" ? hostOf(url) : words);
		}
	}

	return [...found].map(([url, title]) => ({ title, url }));
}
