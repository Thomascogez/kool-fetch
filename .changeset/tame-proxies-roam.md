---
"kool-fetch": minor
---

### Added: `proxy` option for routing requests through an HTTP/SOCKS forward proxy

kool-fetch can now route requests through a forward proxy (e.g. Fixie), similar
to axios' `proxy` option — configurable globally or overridden per request
(`proxy: false` disables a global proxy for a single request).

The right transport is picked automatically for the current runtime:

- **Bun** and **Deno** use their native, built-in proxy support with no extra
  dependency.
- **Node.js** (including Vercel Functions/Fluid Compute, and Cloudflare
  Workers with the `nodejs_compat` compatibility flag) uses
  [`undici`](https://www.npmjs.com/package/undici)'s `ProxyAgent`. `undici` is
  an **optional peer dependency** — install it yourself only if you use
  `proxy` in one of these environments. If it's missing, `proxy` throws a
  clear error instead of silently sending the request unproxied.

Real browsers, and any other environment with no hook into how `fetch` opens
its network connection, have no equivalent — this is a platform limitation
that axios shares, not something kool-fetch can work around. See the README's
"Proxy" section for details and a suggested workaround (routing through a
server you control).
