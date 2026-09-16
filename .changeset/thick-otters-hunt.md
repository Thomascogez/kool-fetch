---
"kool-fetch": patch
---

### Fixed: Node/undici `proxy` fallback could leak an unbounded number of sockets

0.6.1 fixed a stale-tunnel problem by creating a brand-new `undici.ProxyAgent`
for every proxied request and closing it once that request finished. That
traded one bug for a worse one: kool-fetch has no built-in request timeout, so
a proxied request that simply hangs (a proxy accepting the TCP connection but
never answering — an ordinary transient hiccup, not something requiring
concurrent load) never reaches the `finally` that would close its dispatcher.
Since every request got its own disposable agent, every such hang leaked a
brand-new, uncapped socket, scattered across the app's entire uptime with no
relation to request volume. Enough of these exhaust the process's
file-descriptor limit, at which point *nothing* in the process can open a new
socket — including requests that never touch kool-fetch.

`ProxyAgent` is now cached and reused per proxy URL again (bounding resource
usage to one shared connection pool, as in 0.6.0), but a dispatch failure
(a connection error, or undici's own header/body timeout catching a silently
dead tunnel) now evicts and closes the cached agent, so the next request
builds a fresh one instead of repeatedly retrying the same broken tunnel. This
fixes both the original 0.6.0 bug (a stale tunnel poisoning every future
request) and the 0.6.1 regression (every hang leaking a socket forever).
