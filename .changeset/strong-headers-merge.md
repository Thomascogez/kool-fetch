---
"kool-fetch": minor
---
### Fixed: Request init headers are now merged instead of replaced

Global `init.headers` are now deep-merged with per-request `headers`. When a
header key exists in both, the per-request value wins. Previously, providing
any `headers` at the request level would erase all global headers, even
non-conflicting ones. All `HeadersInit` formats (object, array of tuples,
`Headers` instance, string) are now supported and normalized.
