import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import type { FileSystem, Scope } from "effect";

import { Catalog, CatalogLive } from "../../src/backend/sessions/catalog.ts";
import type { CatalogApi } from "../../src/backend/sessions/catalog.ts";

/** The catalog the way the server builds it: a layer, yielded as a service. */
const catalogLayer = (home: string): Layer.Layer<Catalog> => {
	const indexPath = join(home, ".epsilon", "session-index.sqlite");
	mkdirSync(dirname(indexPath), { recursive: true });
	return Layer.provideMerge(
		CatalogLive(indexPath, { formatVersion: 3, piVersion: "1.4.0", schemaVersion: "1" }),
		BunServices.layer,
	);
};

export const withCatalog = <A, E>(
	home: string,
	body: (catalog: CatalogApi) => Effect.Effect<A, E>,
) =>
	Effect.gen(function* () {
		const catalog = yield* Catalog;
		return yield* body(catalog);
	}).pipe(Effect.provide(catalogLayer(home)));

/** The same, with a scope for `watch`; the scope closes when the body returns. */
export const withCatalogScoped = <A, E>(
	home: string,
	body: (catalog: CatalogApi) => Effect.Effect<A, E, Scope.Scope | FileSystem.FileSystem>,
) =>
	Effect.scoped(
		Effect.gen(function* () {
			const catalog = yield* Catalog;
			return yield* body(catalog);
		}).pipe(Effect.provide(catalogLayer(home))),
	);
