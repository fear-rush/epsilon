# The e2e specs assert the app as built

**Decision**

The Playwright specs are updated to the controls the pages draw, and a spec that expects a control no version of the app has is a spec bug. They were written before the UI existed ("write the specs first"), which is why most of the seven failures expected controls no version of the app has: a "Session settings" dialog, a "Branch tree" button, a link labelled "add provider".

**Why**

The suite's value is that it opens the real app and reads it. A spec pinned to a prototype turns every UI decision into a red test that says nothing about the code.

**Rejected**

Keeping both UIs alive to satisfy the specs. Deleting a spec that found a real bug: `onboarding` found that a custom model without cost rates could not be saved at all.
