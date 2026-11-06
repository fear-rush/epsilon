# "Can run a turn" counts configured providers

**Decision**

The General page's Status row counts, and the Default model picker offers, only models whose provider pi reports as configured. The settings rows still describe every composed model.

**Why**

pi's catalog is a catalogue, not a bill of health: on the dev sandbox it composes 1693 models against one credential, so the row promised runs that would fail. pi's own answer to "configured" is the one the engine obeys.

**Rejected**

Counting the whole catalog and rewording the sentence.
