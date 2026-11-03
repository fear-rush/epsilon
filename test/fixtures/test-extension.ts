import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * A deliberately broken extension for the acceptance tests. `EPSILON_TEST_EXTENSION`
 * picks one behaviour, so one file can test a rejected shutdown (F2), a slow settle
 * (F6) and a failed wire (F8a) without shipping test code in the engine.
 */
export default function (pi: ExtensionAPI): void {
	const mode = process.env["EPSILON_TEST_EXTENSION"];
	switch (mode) {
		case "slow-settled":
			pi.on("agent_settled", async () => {
				await new Promise<void>((resolve) => {
					setTimeout(() => resolve(), 1_000);
				});
			});
			return;
		case "throw-start":
			pi.on("session_start", () => {
				throw new Error("the test extension failed to start");
			});
			return;
		case "throw-shutdown":
			pi.on("session_shutdown", () => {
				throw new Error("the test extension failed to shut down");
			});
			return;
		default:
			return;
	}
}
