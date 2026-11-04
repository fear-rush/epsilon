import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { Schema } from "effect";

import { report } from "./lib.ts";

/**
 * Gzipped JS a tab fetches before it paints, for the two routes a person can land on.
 *
 * The number comes from Vite's manifest, not from the size of `dist/app`: a route is the
 * page entry plus the static imports of its route component, while a lazy chunk (a code
 * fence, the markdown parser) is fetched after paint and stays out of the budget.
 *
 * The build runs here into a scratch directory, with the route tree regenerated first, so a
 * stale `dist/app` cannot make the benchmark lie.
 */
const ManifestEntry = Schema.Struct({
	file: Schema.String,
	imports: Schema.optional(Schema.Array(Schema.String)),
});
type ManifestEntry = typeof ManifestEntry.Type;

const Manifest = Schema.Record(Schema.String, ManifestEntry);

const repoRoot = join(import.meta.dirname, "../..");
const outDir = mkdtempSync(join(tmpdir(), "epsilon-bench-bundle-"));

/** The route component each page resolves to; the router plugin adds a query suffix. */
const layoutRoute = "routes/_app/route.tsx";
const homeRoute = "routes/_app/index.tsx";
const sessionRoute = "routes/_app/sessions/$sessionId.tsx";

const kib = (bytes: number): number => +(bytes / 1024).toFixed(1);

async function run(command: ReadonlyArray<string>): Promise<void> {
	const child = Bun.spawn([...command], {
		cwd: repoRoot,
		stderr: "inherit",
		stdout: "ignore",
	});
	const code = await child.exited;
	if (code !== 0) throw new Error(`${command.join(" ")} exited with ${code}`);
}

async function readManifest(): Promise<Record<string, ManifestEntry>> {
	return Schema.decodeUnknownSync(Manifest)(
		await Bun.file(join(outDir, ".vite/manifest.json")).json(),
	);
}

function routeKey(manifest: Record<string, ManifestEntry>, source: string): string {
	const key = Object.keys(manifest).find(
		(candidate) => candidate === source || candidate.startsWith(`${source}?`),
	);
	if (key === undefined) throw new Error(`manifest has no "${source}"`);
	return key;
}

/** The gzipped bytes of one page: its chunk and every static import it pulls. */
async function pageBytes(
	manifest: Record<string, ManifestEntry>,
	roots: ReadonlyArray<string>,
): Promise<number> {
	const seen = new Set<string>();
	const queue = [...roots];
	let total = 0;

	while (queue.length > 0) {
		const key = queue.shift();
		if (key === undefined) break;
		if (seen.has(key)) continue;
		seen.add(key);

		const entry = manifest[key];
		if (entry === undefined) throw new Error(`manifest has no "${key}"`);
		// A chunk names the next one, so the reads cannot run together.
		// oxlint-disable-next-line no-await-in-loop -- discovered one chunk at a time
		const bytes = await Bun.file(join(outDir, entry.file)).bytes();
		total += gzipSync(bytes).length;
		for (const imported of entry.imports ?? []) queue.push(imported);
	}

	return total;
}

try {
	await run([process.execPath, "run", "routes:generate"]);
	await run([
		process.execPath,
		"x",
		"vite",
		"build",
		"--outDir",
		outDir,
		"--emptyOutDir",
		"--manifest",
		"--logLevel",
		"warn",
	]);

	const manifest = await readManifest();
	// The shell is a route of its own and loads on every page, so it counts for both.
	const layout = routeKey(manifest, layoutRoute);
	const home = await pageBytes(manifest, ["index.html", layout, routeKey(manifest, homeRoute)]);
	const session = await pageBytes(manifest, [
		"index.html",
		layout,
		routeKey(manifest, sessionRoute),
	]);

	console.error(
		`bundle-size: / ${kib(home)} KiB, /sessions/$id ${kib(session)} KiB, budget applies to each`,
	);
	await report("bundle-size", "KiB", Math.max(kib(home), kib(session)));
} finally {
	rmSync(outDir, { force: true, recursive: true });
}
