---
"kool-fetch": patch
---

### Fixed: the `proxy` option silently dropped `signal`, `credentials`, `cache`, `integrity`, `keepalive`, `referrer`, `referrerPolicy`, and `mode`

The Bun, Deno, and Node/undici proxy transports all convert the intercepted
`Request` back into plain `fetch(url, init)` arguments, but that conversion
only forwarded `method`, `headers`, `body`, and `redirect`. Every other
`RequestInit` field was silently dropped once a `proxy` was configured.

The most impactful case: `signal` was dropped, so an `AbortController` or
timeout attached by the caller was silently ignored for any proxied
request — including as a workaround for the lack of a built-in request
timeout. All eight fields are now forwarded.
