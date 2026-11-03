import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { startFakeEngine } from "./fake-engine.ts";
import {
	branchedSession,
	fiftyThousand,
	halfWrittenSession,
	linearSession,
	renamedSession,
	sessionHeader,
	sessionVersion,
} from "./sessions.ts";
import { assertNotRealHome, testPaths } from "./setup.ts";
import { until } from "./until.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const parse = (line: string): Record<string, unknown> => {
	const value: unknown = JSON.parse(line);
	if (!isRecord(value)) throw new Error("line is not an object");
	return value;
};

describe("preload", () => {
	test("gives the process a scratch home outside the real one", () => {
		expect(testPaths.scratch).toContain("epsilon-test-");
		expect(testPaths.agentHome).not.toBe(testPaths.realHome);
		expect(process.env["PI_CODING_AGENT_DIR"]).toBe(testPaths.agentHome);
		expect(process.env["HOME"]).toBe(testPaths.sandboxHome);
		expect(process.env["EPSILON_AGENT_HOME"]).toBe(testPaths.agentHome);
	});

	test("refuses a path inside the real home", () => {
		expect(() => assertNotRealHome(testPaths.realHome)).toThrow("real home");
		expect(() => assertNotRealHome(resolve(testPaths.realHome, ".pi", "agent"))).toThrow(
			"real home",
		);
		expect(() => assertNotRealHome(testPaths.agentHome)).not.toThrow();
	});
});

describe("until", () => {
	test("resolves once the predicate turns true", async () => {
		let count = 0;
		await until(() => ++count >= 3, { what: "three polls", deadline: 500 });
		expect(count).toBe(3);
	});

	test("fails with what it waited for", async () => {
		await expect(
			until(() => false, { what: "a thing that never happens", deadline: 30 }),
		).rejects.toThrow("waited 30 ms for a thing that never happens");
	});
});

describe("session generators", () => {
	test("write pi's v3 header and message entries", () => {
		const lines = linearSession("s1", "/tmp/project", 3).trimEnd().split("\n");
		expect(lines).toHaveLength(4);
		const header = parse(lines[0] ?? "");
		expect(header["type"]).toBe("session");
		expect(header["version"]).toBe(sessionVersion);
		expect(header["id"]).toBe("s1");
		const first = parse(lines[1] ?? "");
		expect(first["type"]).toBe("message");
		expect(first["id"]).toBe("e000000");
		expect(first["parentId"]).toBeNull();
	});

	test("keep a branch as two children of one entry", () => {
		const lines = branchedSession("s2", "/tmp/project").trimEnd().split("\n").slice(1);
		const parents = lines.map((line) => parse(line)["parentId"]);
		expect(parents.filter((parent) => parent === "e2")).toHaveLength(2);
	});

	test("carry a rename in session_info", () => {
		const name = renamedSession("s3", "/tmp/project", "Renamed chat")
			.trimEnd()
			.split("\n")
			.map(parse)
			.find((entry) => entry["type"] === "session_info");
		expect(name?.["name"]).toBe("Renamed chat");
	});

	test("leave a half-written last line with no newline", () => {
		const text = halfWrittenSession("s4", "/tmp/project");
		expect(text.endsWith("\n")).toBe(false);
		const last = text.trimEnd().split("\n").at(-1) ?? "";
		expect(() => JSON.parse(last)).toThrow();
	});

	test("build 50,000 entries without recursion", () => {
		const text = fiftyThousand("s5", "/tmp/project");
		expect(text.split("\n")).toHaveLength(50_002);
		expect(text.startsWith(sessionHeader("s5", "/tmp/project"))).toBe(true);
	});
});

describe("fake engine", () => {
	test("answers init and exits on shutdown", async () => {
		const engine = startFakeEngine();
		try {
			await engine.waitFor("started");
			engine.send({ type: "init", sessionId: "s1" });
			const ready = await engine.waitFor("ready");
			expect(ready["pid"]).toBe(engine.pid);
			engine.send({ type: "echo", value: 7 });
			const echo = await engine.waitFor("echo");
			expect(echo["value"]).toBe(7);
		} finally {
			engine.stop();
			await engine.exited;
		}
	});

	test("exits with the code it was told to crash with", async () => {
		const engine = startFakeEngine();
		await engine.waitFor("started");
		engine.send({ type: "crash" });
		expect(await engine.exited).toBe(9);
	});
});
