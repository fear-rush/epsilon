# Files are split by meaning

**Decision**

No file that only re-exports or wraps one line. No folder for one file. A split happens when a file holds two concepts, not to hit a line count.

**Why**

The old tree had one-line route files and a wrapper for every call, which made the real shape hard to see.

**Rejected**

A maximum line count. Meaning, not size, decides.
