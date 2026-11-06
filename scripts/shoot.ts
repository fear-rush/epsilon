/**
 * Screenshot routes of the built app with iris.
 *
 * bun run shoot <route…> [--out dir]
 *
 * Starts the built server on a scratch agent home with the stub model (never the real
 * `~/.pi`), runs one iris batch against it and stops both on every path. Run `bun run
 * build` first. An interactive state (a dialog, a menu) is playwright-cli's job.
 */
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { argv } from "node:process";

import { launchEpsilon } from "../test/e2e/app.ts";
import { startStubModel, writeStubModels } from "../test/e2e/stub-model.ts";

const DEADLINE_MS = 45_000;
const READY = '[data-ready="true"]';
const INSTALL = "install iris: cargo install iris-screenshot --version 0.4.1 --locked";

const args = argv.slice(2);
const outAt = args.indexOf("--out");
const routes = args.filter((_, index) => (index !== outAt && index !== outAt + 1) || outAt < 0);
const date = new Date().toISOString().slice(0, 10);
const out = outAt >= 0 ? (args[outAt + 1] ?? "") : `.sandbox/shots/${date}`;

if (routes.length === 0 || out === "") {
	process.stderr.write("usage: bun run shoot <route…> [--out dir]\n");
	process.exit(2);
}

const iris = Bun.which("iris") ?? join(homedir(), ".cargo/bin/iris");
if (!(await Bun.file(iris).exists())) {
	process.stderr.write(`${INSTALL}\n`);
	process.exit(2);
}

const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (address === null || typeof address === "string") {
				probe.close();
				reject(new Error("no port was assigned"));
				return;
			}
			const { port } = address;
			probe.close(() => resolve(port));
		});
	});

const stub = await startStubModel();
const home = mkdtempSync(join(tmpdir(), "epsilon-shoot-"));
writeStubModels(home, stub.baseUrl, [{ id: "stub-model", name: "Stub Model" }]);
const app = await launchEpsilon({ home, port: await freePort() });

let code = 1;
try {
	const run = Bun.spawn(
		[
			iris,
			"--size",
			"desktop",
			"--wait-for",
			READY,
			"--wait",
			"400",
			"--json",
			"-o",
			out,
			...routes.map((route) => `${app.url}${route}`),
		],
		{
			stdin: "ignore",
			stdout: "pipe",
			stderr: "inherit",
			timeout: DEADLINE_MS,
			killSignal: "SIGKILL",
		},
	);
	const text = await new Response(run.stdout).text();
	await run.exited;
	process.stdout.write(text);
	const lines = text.split("\n").filter((line) => line.trim() !== "");
	const failed = lines.some(
		(line) => !line.includes('"status":"ok"') && !line.includes('"status": "ok"'),
	);
	code = run.exitCode === 0 && lines.length > 0 && !failed ? 0 : 1;
} finally {
	app.stop();
	stub.stop();
}
process.exit(code);
