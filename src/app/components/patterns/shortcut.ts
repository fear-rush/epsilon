/** The key that reads as Cmd on a Mac and Ctrl elsewhere, for a tooltip's shortcut. */
const MOD = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);

/** A shortcut for a tooltip: `⌘B` on a Mac, `Ctrl+B` elsewhere. */
export const shortcut = (key: string): string => (MOD ? `⌘${key}` : `Ctrl+${key}`);
