# Effect on the server, React on the page

**Decision**

Server, engine and the client's runtime layer use Effect: typed errors, scoped resources, fibers for runs, `Clock` for time. React components stay React, and the conversation reducer stays a pure function in `src/domain/`.

**Why**

Every failure and every possibility is a value, resources close in reverse order, and a test controls time instead of sleeping. Cost accepted: a style to learn and to enforce; effect.md is that style, and lint holds the parts a reviewer would otherwise repeat.

**Rejected**

zod beside Effect Schema (two schema languages). Adapters that let old code run on Effect: the old tree was deleted instead.
