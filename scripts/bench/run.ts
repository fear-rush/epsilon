/** Runs every benchmark in turn; the first failure stops the run. */
const scripts = [
	"catalog-list.ts",
	"catalog-cold.ts",
	"catalog-append.ts",
	"catalog-stall.ts",
	"catalog-warm.ts",
	"open-window.ts",
	"engine-spawn.ts",
	"client-stream.ts",
];

for (const script of scripts) {
	const child = Bun.spawn(["bun", "run", new URL(script, import.meta.url).pathname], {
		stderr: "inherit",
		stdout: "inherit",
	});
	// oxlint-disable-next-line no-await-in-loop -- benchmarks run one at a time
	const code = await child.exited;
	if (code !== 0) process.exit(code);
}
