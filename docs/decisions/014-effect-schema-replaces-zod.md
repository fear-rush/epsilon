# Effect Schema replaces zod

**Decision**

Every wire shape, tagged error and form contract is an Effect `Schema`.

**Why**

Effect's RPC, `Schema.TaggedError` and forms take the same schema, so one definition covers validation, the type, the wire encoding and the form.

**Rejected**

Keeping zod for the client forms; `Schema.toStandardSchemaV1` covers that.
