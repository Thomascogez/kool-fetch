---
"kool-fetch": patch
---

### Fixed: Node/undici `proxy` fallback could stall on a reused tunnel

The Node (and Vercel Functions/Fluid Compute, Cloudflare Workers with
`nodejs_compat`) fallback cached a single `undici.ProxyAgent` — and its
pooled, kept-alive proxy tunnel — per proxy URL, reused forever across every
request. If that one tunnel went stale (the proxy silently dropped it, a
half-open TCP connection, etc.), every later request routed through the
cached agent could hang on the same dead socket.

A fresh `ProxyAgent` is now created for each request and closed once that
request's response finishes, so a stalled or dropped tunnel dies with the
request that opened it instead of poisoning later requests. This mirrors
axios' own default: its proxy agent doesn't opt into `keepAlive`, so Node
tears the socket down after every request and the next one always
negotiates a brand-new CONNECT tunnel. Same trade-off here — no connection
reuse across proxied requests, in exchange for reliability.

Bun and Deno's native proxy support is unaffected; they own their own
connection pooling and this fix is specific to the undici fallback.
