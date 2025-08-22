
<h1 align="center">
  <br>
  <img src="./assets/logo.png" alt="kool-fetch logo" width="200">
  <br>
  kool-fetch
  <br>
</h1>

<h4 align="center">A lightweight (~8kb), 0 dependency fetch wrapper bringing axios like request and response interceptors</h4>

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
```

## Options

| Name | Description | Default | Example |
| --- | --- | --- | --- |
| `baseURL` | Base URL to use for all requests | undefined | "<https://example.com>" \| new URL("<https://example.com>") |
| `fetch` | Fetch function to use for all requests | globalThis.fetch | globalThis.fetch |
| `init` | Request init to use for all requests | undefined | { headers: { "Authorization": "Bearer token" } } |
| `throwOnHttpError` | Throw an error when the response is not ok | true | false |
| `httpErrorFactory` | Factory function to create an error when the response is not ok | (response) => Error(response.statusText) | (response) => { return new Error(response.statusText) } |

## Unwrap responses

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

### Safe version
>
> Alternatively you can use the `unwrapSafe` method which return a golang style tuple containing the unwrapped value and the error if any

```ts
const [unwrappedValue, error] = await koolFetch("/api/users").unwrapSafe("json"); // if response is not ok, unwrappedValue will be undefined and error will contain the error

const [unwrappedValue, error] = await koolFetch("/api/users").unwrapSafe<{userId: number; name: string}>("json");
```

## Interceptors

kool-fetch provides a simple API to attach interceptors to the request and response events.

### Request interceptors

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

### Response interceptors

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
