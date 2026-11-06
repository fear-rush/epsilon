# A failed step's line says "failed" twice

`Failed to run bun run test … failed` in a run card: `Terminal`'s title already carries
the outcome and `ToolTrace`'s description repeats it.

Do: drop one of the two, for every failed card, not only in a run.
Don't: change any other wording in the card.
Done when: a screenshot of a failed run card shows the outcome once.
Stop and ask when: the choice of which wording stays is not obvious.
