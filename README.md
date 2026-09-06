
<h1 align="center">
  <br>
  <img src="./assets/logo.png" alt="kool-fetch logo" width="200">
  <br>
  kool-fetch
  <br>
</h1>

<h4 align="center">A lightweight (~8kb), 0 dependency fetch wrapper bringing axios like request and response interceptors and built-in retry support</h4>

<p align="center">
  <a href="https://badge.fury.io/js/kool-fetch">
    <img src="https://badge.fury.io/js/kool-fetch.svg" alt="kool-fetch">
  </a>

</p>

## How To Use

### 1. Install

```bash
npm install kool-fetch 

# or

bun install kool-fetch

# or

pnpm install kool-fetch
```

### 2. Usage

To get started, create a new kool-fetch instance

```ts
import { createKoolFetch } from "kool-fetch";

export const koolFetch = createKoolFetch({
    baseURL: "https://example.com",
    throwOnHttpError: true,
    httpErrorFactory: (response) => {
        return new Error(response.statusText);
    },
});

koolFetch.addInterceptor("request", (request) => {
    console.log(`Sending request to ${request.url}`);
    return request;
});

koolFetch.addInterceptor("response", (response) => {
    console.log(`Received response from ${response.url}`);

    if(response.status === 401) {
        // redirect to login page
    }

    return response;
});
```

Then you can use it like you would use the native fetch API

```ts
await koolFetch("/api/users"); // koolFetch is still under the hood a fetch function

await koolFetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "John Doe" }),
});

await koolFetch("/api/users/").unwrap("json") // A native fetch version with some cool extra 😉
```

## Options

When you are initializing your kool-fetch instance you have multiple usefull options available

| Name | Description | Default | Example |
| --- | --- | --- | --- |
| `baseURL` | Base URL to use for all requests | undefined | "https://example.com" | new URL("https://example.com") |
| `fetch` | Fetch function to use for all requests | globalThis.fetch | globalThis.fetch |
| `init` | Request init to use for all requests | undefined | { headers: { "Authorization": "Bearer token" } } |
| `throwOnHttpError` | Throw an error when the response is not ok | true | false |
| `httpErrorFactory` | Factory function to create an error when the response is not ok | (response) => Error(response.statusText) | (response) => { return new Error(response.statusText) } |
| `retry` | Retry configuration (boolean or object) | undefined | true / { retries: 3 } |
| `proxy` | HTTP/SOCKS forward proxy URL to route requests through | undefined | "http://user:pass@proxy.example.com:8080" |

## Features

### Unwrap responses

Responses of requests made with kool-fetch are wrapped with a Proxy that expose an `unwrap` method. This method allows you to unwrap the response to a specific type, making it a shortcut to classical `await response.json()` or `await response.arrayBuffer()`, ... calls.

```ts
const koolFetch = createKoolFetch({
    throwOnHttpError: true,
    baseURL: "https://api.example.com",
});

await koolFetch("/api/users").unwrap("json"); // if the response is not ok, an error will be thrown

await koolFetch("/api/users").unwrap<{userId: number; name: string}>("json"); 

await koolFetch("/api/file").unwrap("arrayBuffer");

await koolFetch("/api/file").unwrap("text");

```

#### Safe version
>
> Alternatively you can use the `unwrapSafe` method which return a golang style tuple containing the unwrapped value and the error if any

```ts
const [unwrappedValue, error] = await koolFetch("/api/users").unwrapSafe("json"); // if response is not ok, unwrappedValue will be undefined and error will contain the error

const [unwrappedValue, error] = await koolFetch("/api/users").unwrapSafe<{userId: number; name: string}>("json");
```

### Interceptors

kool-fetch provides a simple API to attach interceptors to the request and response events.

#### Request interceptors

You can attach request interceptors, they can be used to modify the request before it is sent to the server

```ts
const logRequestInterceptor = (request: Request) => {
    console.log(`Sending request to ${request.url}`);
    return request;
};

const attachAuthorizationHeaderInterceptor = (request: Request) => {
    request.headers.set("Authorization", "Bearer token");
    return request;
};

koolFetch.addInterceptor("request", logRequestInterceptor);
koolFetch.addInterceptor("request", attachAuthorizationHeaderInterceptor);
// This will execute logRequestInterceptor and attachAuthorizationHeaderInterceptor in order

// You can also at any time remove an interceptor
koolFetch.removeInterceptor("request", logRequestInterceptor);
```

#### Response interceptors

You can attach response interceptors, they can be used to modify the response before it is returned to the client

```ts
const logResponseInterceptor = (response: Response) => {
    console.log(`Received response from ${response.url}`);
    return response;
};

const handleUnauthorizedResponseInterceptor = (response: Response) => {
   return new Response(JSON.stringify({ message: "The response has been modified" }), response);
};

koolFetch.addInterceptor("response", logResponseInterceptor);
koolFetch.addInterceptor("response", handleUnauthorizedResponseInterceptor);
// This will execute logResponseInterceptor and handleUnauthorizedResponseInterceptor in order

// You can also at any time remove an interceptor
koolFetch.removeInterceptor("response", logResponseInterceptor);
koolFetch.removeInterceptor("response", handleUnauthorizedResponseInterceptor);
```

#### Per-Request Interceptors

You can also add interceptors per-request using the chained API:

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
```

### Retry

kool-fetch supports automatic retry on failure.

#### Global Retry

Enable retry globally when creating the instance:

```ts
const api = createKoolFetch({
  baseURL: "https://api.example.com",
  retry: true, // enables retry with defaults
  // or with custom config:
  retry: {
    retries: 3,
    delay: 1000,
    statusCodes: [500, 502, 503, 504],
    methods: ["GET", "HEAD", "OPTIONS"]
  }
});
```

#### Per-Request Retry Override

Override retry settings per-request:

```ts
// Disable retry for this specific request
await koolFetch("/flaky", { retry: false });

// Override with custom settings
await koolFetch("/flaky", { retry: { retries: 5 } });
```

#### Retry Options

| Option | Description | Default |
| --- | --- | --- |
| `retries` | Number of retry attempts | `3` |
| `delay` | Delay between retries (ms) or function | `0` |
| `statusCodes` | HTTP status codes to retry | `[500, 502, 503, 504]` |
| `methods` | HTTP methods to retry | `["GET", "HEAD", "OPTIONS"]` |

#### Retry Delay Function

The `delay` option can be a function for dynamic delays (e.g., exponential backoff):

```ts
retry: {
  retries: 3,
  delay: (attempt, response) => {
    // Use Retry-After header if available
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) return parseInt(retryAfter) * 1000;
    
    // Exponential backoff
    return 1000 * 2 ** attempt;
  }
}
```

### Proxy

kool-fetch supports routing requests through an HTTP/SOCKS forward proxy (e.g. Fixie), similar to axios' `proxy` option.

```ts
const koolFetch = createKoolFetch({
  baseURL: "https://api.example.com",
  proxy: "http://user:pass@proxy.example.com:8080",
});

// Disable the proxy for a single request
await koolFetch("/no-proxy", { proxy: false });

// Use a different proxy for a single request
await koolFetch("/via-other-proxy", { proxy: "http://other-proxy.example.com:8080" });
```

Under the hood, kool-fetch picks the right transport for the current runtime:

- **Bun** and **Deno** — uses their native, built-in proxy support, no extra dependency needed.
- **Node.js** (including Vercel Functions/Fluid Compute, and Cloudflare Workers with the `nodejs_compat` compatibility flag) — uses [`undici`](https://www.npmjs.com/package/undici)'s `ProxyAgent`. `undici` is an **optional peer dependency**: install it yourself (`npm install undici`) only if you use `proxy` in one of these environments. If it isn't installed, `proxy` throws a clear error instead of silently sending your request unproxied.

Real browsers, and any other environment with no way to hook into how `fetch` opens its network connection, have no equivalent — this is a platform limitation, not something kool-fetch (or axios) can work around. If you need proxying from such an environment, route the request through a server you control instead, and point `baseURL` at that server.

## Usage with third party libraries

### Hono RPC

You can directly use kool-fetch with @honojs RPC client since it is a drop in replacement for the native fetch API

```ts
import { createKoolFetch } from "kool-fetch";
import { hc } from "hono/client";

const koolFetch = createKoolFetch({
    init: { credentials: "include" }
});

koolFetch.addInterceptor("response", async (response) => {
    if (!response.ok) {
        const clonedResponse = response.clone();
        const body = await clonedResponse.json()
        toast.error(body.message ?? "An unknown error occurred");
    }

    return response;
});

export const apiClient = hc(import.meta.env.VITE_API_URL, { fetch: koolFetch });
```

## License

MIT

---

> GitHub [@Thomascogez](https://github.com/Thomascogez) &nbsp;&middot;&nbsp;
> X [@Thomascogez](https://x.com/ThomasCogez)
