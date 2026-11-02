/**
 * The approval policy's one decision: which calls stop for a person. The mode is
 * Epsilon's, the danger claim is the tool's own (`destructiveHint`, which an MCP
 * server or a custom extension sets), and the name check stays for pi's built-ins
 * only. A tool that declares it destroys data stops in both guarded modes, which is
 * the change that makes a custom or MCP write ask instead of running unannounced.
 */
import { describe, expect, test } from "bun:test";

import { toolStops } from "./permission";

describe("which tool calls stop for a person", () => {
	test("a tool that declares it destroys data stops under either guarded mode", () => {
		expect(toolStops("ask", "flatten_repo", true)).toBe(true);
		expect(toolStops("strict", "flatten_repo", true)).toBe(true);
		expect(toolStops("yolo", "flatten_repo", true)).toBe(false);
	});

	test("a harmless custom tool runs, so the guard does not become a wall", () => {
		expect(toolStops("ask", "flatten_repo", false)).toBe(false);
		expect(toolStops("strict", "flatten_repo", undefined)).toBe(false);
	});

	test("pi's built-ins keep their own rules: bash always, writes only in strict", () => {
		expect(toolStops("ask", "bash", undefined)).toBe(true);
		expect(toolStops("ask", "write", undefined)).toBe(false);
		expect(toolStops("strict", "write", undefined)).toBe(true);
		expect(toolStops("strict", "edit", undefined)).toBe(true);
		expect(toolStops("strict", "read", undefined)).toBe(false);
	});

	test("a read-only hint never adds a prompt", () => {
		expect(toolStops("ask", "list_files", false)).toBe(false);
		expect(toolStops("strict", "list_files", false)).toBe(false);
	});
});
