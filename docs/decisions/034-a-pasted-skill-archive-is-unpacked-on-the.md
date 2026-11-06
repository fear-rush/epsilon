# A pasted skill archive is unpacked on the server

**Decision**

The import sends a picked `.zip`, `.tar`, `.tar.gz` or `.tgz` as one file. The server unpacks it with the same `src/domain/skills/archive.ts` that the upload path already used, and every entry goes through one set of path rules there.

**Why**

One unpacker cannot disagree with another about what a path means, the checks that matter run where the files are written, and the page stops shipping a zip parser. The old dialog unzipped in the browser and uploaded the entries, so two implementations had to agree on stripped paths, modes and size limits.

**Rejected**

Unzipping in the page. Trusting the archive's own paths.
