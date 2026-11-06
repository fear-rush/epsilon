import { join } from "node:path";

/** Thresholds live in `budgets.json`; values are milliseconds or KiB, as each script says. */
export type BudgetName =
	| "catalog-list"
	| "catalog-cold"
	| "catalog-append"
	| "catalog-stall"
	| "catalog-warm"
	| "open-window"
	| "engine-spawn"
	| "client-stream";

const budgetsPath = join(import.meta.dirname, "budgets.json");

async function readBudgets(): Promise<Record<string, number>> {
	const parsed: unknown = await Bun.file(budgetsPath).json();
	if (typeof parsed !== "object" || parsed === null)
		throw new Error("budgets.json is not an object");
	const budgets: Record<string, number> = {};
	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value !== "number") throw new Error(`budgets.json: "${key}" is not a number`);
		budgets[key] = value;
	}
	return budgets;
}

export async function budget(name: BudgetName): Promise<number> {
	const value = (await readBudgets())[name];
	if (value === undefined) throw new Error(`budgets.json has no "${name}"`);
	return value;
}

/** Reports a measured value against its budget and exits non-zero when it is over. */
export async function report(name: BudgetName, unit: "ms" | "KiB", value: number): Promise<void> {
	const limit = await budget(name);
	const within = value <= limit;
	console.log(JSON.stringify({ name, unit, value, limit, within }));
	if (!within) process.exit(1);
}

/**
 * A benchmark whose subject does not exist yet. It fails loudly with the step that will
 * make it real, so `bun run bench` cannot look green on a missing feature.
 */
export function notBuilt(name: BudgetName, step: number): never {
	console.error(`${name}: not built yet; lands in step ${step}`);
	process.exit(2);
}
