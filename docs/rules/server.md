# Server rules

Filled by step 03.

## To reshape

1. If both sides run a rule, put it in `src/domain/<name>/rules.ts`.
2. The schema goes in `src/protocol/<name>.ts`; the server handler in
   `src/backend/<name>/`; the UI in `src/app/features/<name>/`. Use the same `<name>` in
   all three and in the route.
3. Server code outside `platform/` reaches IO through a service: `Context.Service`, its
   `Layer` in the same file, `Effect.fn` on every operation
   ([docs/rules/server.md](docs/rules/server.md)).
4. Run the check the change calls for ([Check by change](#check-by-change)). A feature
   is done when its behavior is verified and its failures are visible in the UI.

There is no line limit; split files by meaning, as
[the client rules](docs/rules/client.md) says.
