---
"kool-fetch": minor
---
### Fixed: `unwrap`/`unwrapSafe` typing

The left element of the tuple returned by `unwrapSafe` was incorrectly typed
as a `Promise` (e.g. `Promise<any> | Promise<Promise<ArrayBuffer>> | undefined`)
instead of the resolved value. It is now correctly typed as the awaited value.

The same fix corrects `unwrap`, which was producing `Promise<Promise<...>>`
for non-`json` targets.

Additionally, `unwrap` and `unwrapSafe` now infer the correct return type from
the target argument. Previously, `unwrap("arrayBuffer")` was typed as
`Promise<unknown>` because the generic default evaluated the full union of all
targets. It is now correctly typed as `Promise<ArrayBuffer>`. The same applies
to `"text"` (`Promise<string>`) and `"blob"` (`Promise<Blob>`).

Type tests have been added (`__tests__/types.test-d.ts`) covering `unwrapSafe`,
`unwrap`, `tryCatch`, `mergeRequestInit`, builder chaining, and `createKoolFetch`.

