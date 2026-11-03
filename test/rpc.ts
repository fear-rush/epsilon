import { Effect } from "effect";
import type { Layer, Scope } from "effect";
import { RpcTest } from "effect/rpc";
import type { Rpc, RpcClient, RpcGroup } from "effect/rpc";

/**
 * A handler test's client: Effect RPC's own in-memory pair, driven through the
 * no-serialization path.
 *
 * The point is the schemas. A test that calls the service directly would pass while the
 * payload, the success value or the tagged error was wrong on the wire; this one encodes
 * and decodes exactly as the socket does, without a socket. `layer` is the handler layer
 * the feature exports, so the test covers the handler too.
 */
export const testClient = <Rpcs extends Rpc.Any, E, R>(
	group: RpcGroup.RpcGroup<Rpcs>,
	layer: Layer.Layer<Rpc.ToHandler<Rpcs>, E, R>,
): Effect.Effect<RpcClient.RpcClient<Rpcs>, E, R | Scope.Scope> =>
	// oxlint-disable-next-line effecttsgo/strict-effect-provide -- a handler test's entry point
	RpcTest.makeClient(group).pipe(Effect.provide(layer));
