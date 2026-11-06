# A refusal's words come from the translator

**Decision**

A refused command reaches the page as a tagged error whose `message` is empty by design; the composer reports the error itself and lets `errorView` supply the sentence. Every `Notice`/`StatusView` takes `error={…}`, and no feature prints `error.message`.

**Why**

Compacting a chat with nothing to compact drew a status line with an icon and no words. The same defect had already been fixed once for the delete dialogs, because a tagged error's message is empty. pi's data messages (a test result, a login question, a parse problem) are not thrown errors and stay text.

**Rejected**

Filling `message` on the protocol's errors, which would duplicate the translator's words in two places.
