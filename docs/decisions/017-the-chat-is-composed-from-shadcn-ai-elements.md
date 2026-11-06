# The chat is composed from shadcn AI Elements

**Decision**

The turn's steps are the copied AI Elements patterns in `src/app/components/ai-elements/`: Chain of Thought around a turn, Reasoning inside it, Plan when the assistant declared its calls up front, Task for the live steps, and Tool, Terminal, Test Results, Stack Trace, Subagent and File Tree for what a call produced. The composer's menus, the context card, the confirmation and the sources use the same set. Two exceptions: the thread stops at Message and Bubble, because TanStack Virtual owns the scroll and the rows (Message Scroller's content mutation and auto-scroll would fight the virtualizer); and the model picker keeps a searchable Command in a Popover instead of the Model Selector's scroll-only radio menu, while the thinking menu stays the second menu of that pattern.

**Why**

The owner asked for the AI Elements surface, and the patterns share one Trace and one Code Block, so a new step reads like the steps beside it. The code is vendored, so it can follow this branch's tokens without a package release. A 5,000-entry chat and the jump rail need one scroll owner. pi offers hundreds of models; a 94-model sandbox list and a 510-model real list cannot be searched by scrolling.

**Rejected**

Bespoke rows for each kind (what the port had, and what made a plan and a tool two layouts). A dependency on a pattern package. Dropping the virtualizer for the primitive's viewport. Making the model menu literal.
