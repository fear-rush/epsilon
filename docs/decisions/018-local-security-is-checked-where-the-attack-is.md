# Local security is checked where the attack is

**Decision**

Bind `127.0.0.1` only. On every request and upgrade check `Host` (defeats DNS rebinding) and `Origin`; require a per-launch token that the served page carries in a meta tag and the client sends in its opening call. Engine IPC is a pipe, not a listening socket.

**Why**

Epsilon can run bash with the operator's rights, and any web page can attempt a local WebSocket. A token in the served HTML is unreadable to a page on another origin, and a `Host` check stops the attacker from becoming "same origin" via DNS.

**Rejected**

A password or account system; there is one operator and one machine.
