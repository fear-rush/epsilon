# An older page arrives without moving the reader

**Decision**

The transcript remembers the scroll height before it asks for the page above, and the layout effect adds the height that page brought. A zero-height line at the top of the scroller says `Loading earlier messages` while the page is in flight, and says so with a retry when it did not arrive.

**Why**

The page lands above the fold, so the content under the reader moved down by its whole height, a jump of several screens in a chat with history. Nothing said a page was being read, and a refused page was silent.

**Rejected**

Following the new page to its top, which loses the reader's place in the opposite direction. Animating the prepended rows into place, which would move what is being read.
