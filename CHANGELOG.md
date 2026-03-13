# kool-fetch

## 0.3.2

### Patch Changes

- b302678: Update realease workflow with oidc publishing

## 0.3.1

### Patch Changes

- e7ad7af: Update release workflow with trusted publishing

## 0.3.0

### Minor Changes

- 32e3b22: ### Per-Request Interceptors

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
  ```

## 0.2.2

### Patch Changes

- 45dd6db: Fix url merging when path contains search params

## 0.2.1

### Patch Changes

- 15376b1: Bump dev dependencies

## 0.2.0

### Minor Changes

- 46de23b: Add safeUnwrap method

## 0.1.1

### Patch Changes

- 1dd18d9: Take in account unwrap target

## 0.1.0

### Minor Changes

- f285a31: Add .unwrap(target) method + return whole request object to httpErrorFactory

## 0.0.2

### Patch Changes

- ad8a6c7: Allow `httpErrorFactory` to be async

## 0.0.1

### Patch Changes

- 396b8ad: Initial release
