---
"kool-fetch": patch
---

Fix type narrowing for `unwrapSafe`: the default `Error` generic is now `Error` instead of `unknown`, so `const [data, error] = await ...; if (error) return;` narrows `data` from `T | undefined` to `T`.
