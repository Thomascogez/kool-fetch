---
"kool-fetch": minor
---

### Per-Request Interceptors

You can now add interceptors per-request using a chained API:

```ts
const response = await koolFetch("/api/users")
  .addInterceptor("request", (req) => {
    req.headers.set("Authorization", "Bearer token");
    return req;
  })
  .addInterceptor("response", (res) => {
    console.log("Response received");
    return res;
  });
// Also supports unwrap/unwrapSafe
const data = await koolFetch("/api/users")
  .addInterceptor("response", loggingInterceptor)
  .unwrap("json");
Built-in Retry
Added automatic retry support as a client option:
// Global retry
const api = createKoolFetch({
  baseURL: "https://api.example.com",
  retry: true, // or { retries: 3, delay: 1000 }
});
// Per-request override
await koolFetch("/flaky", { retry: false });
await koolFetch("/flaky", { retry: { retries: 5 } });
New retry options:
- retries - Number of retry attempts (default: 3)
- delay - Delay between retries in ms or function (default: 0)
- statusCodes - HTTP status codes to retry (default: 500, 502, 503, 504)
- methods - HTTP methods to retry (default: "GET", "HEAD", "OPTIONS")
The delay function receives the previous response, enabling use of headers like Retry-After:
retry: {
  retries: 3,
  delay: (_attempt, response) => {
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) return parseInt(retryAfter, 10) * 1000;
    return 0;
  }
}
Type Improvements
- Unified interceptor types with InterceptorHandler<T> generic type
- Added KoolFetchRequestInit type extending RequestInit with retry option
- Fixed interceptor chain to properly pass modified request/response to next interceptor
Bug Fixes
- Fixed retry delay function not receiving response object
- Fixed request/response interceptors not chaining properly (each interceptor now receives the modified value from previous interceptor)
