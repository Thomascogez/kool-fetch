---
"kool-fetch": patch
---

### Fixed: retrying a request with a body crashed on the second attempt

Retries dispatched the same `Request` object on every attempt. A request body
can only be read once, so any retryable request that has a body (for example
a `POST` with a custom `retry.methods` including `"POST"`) threw `Body is
unusable: Body has already been read` on the first retry instead of actually
retrying.

Each retry attempt now dispatches its own `request.clone()` instead of the
original, so the body is available fresh on every attempt.
