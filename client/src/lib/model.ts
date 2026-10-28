/** pi's model names use a middot ("DeepSeek V4 · vision"); the UI does not. */
export const modelLabel = (name: string): string =>
	name.replaceAll(" · ", ", ").replaceAll("·", ",");
