import http from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createKoolFetch } from "../src";

type ReceivedRequest = {
	method: string;
	url: string;
	headers: http.IncomingHttpHeaders;
	body: Buffer;
};

// A minimal forward proxy: it never needs to actually reach "example.com"
// because a real forward proxy receives the absolute-form request itself and
// answers it directly, so this is enough to prove requests were routed
// through the proxy rather than sent directly. Also counts raw TCP
// connections (rather than requests) so tests can tell whether a proxy
// dispatcher reused one connection across requests or opened a fresh one
// per request.
const startProxyServer = () => {
	const requests: string[] = [];
	const receivedRequests: ReceivedRequest[] = [];
	let connectionCount = 0;
	let flakyAttempts = 0;
	const server = http.createServer((req, res) => {
		requests.push(req.url ?? "");

		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			receivedRequests.push({
				method: req.method ?? "",
				url: req.url ?? "",
				headers: req.headers,
				body: Buffer.concat(chunks),
			});

			if (req.url?.includes("fail")) {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "nope" }));
				return;
			}
			if (req.url?.includes("flaky")) {
				flakyAttempts += 1;
				if (flakyAttempts === 1) {
					res.writeHead(500, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "nope" }));
					return;
				}
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({ body: Buffer.concat(chunks).toString("utf8") }),
				);
				return;
			}
			if (req.url?.includes("echo")) {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(
					JSON.stringify({
						method: req.method,
						headers: req.headers,
						body: Buffer.concat(chunks).toString("utf8"),
					}),
				);
				return;
			}
			if (req.url?.includes("slow")) {
				setTimeout(() => {
					res.writeHead(200, { "content-type": "application/json" });
					res.end(JSON.stringify({ viaProxy: true }));
				}, 500);
				return;
			}
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ viaProxy: true }));
		});
	});

	server.on("connection", () => {
		connectionCount += 1;
	});

	return new Promise<{
		url: string;
		requests: string[];
		receivedRequests: ReceivedRequest[];
		connectionCount: () => number;
		close: () => Promise<void>;
	}>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			resolve({
				url: `http://127.0.0.1:${port}`,
				requests,
				receivedRequests,
				connectionCount: () => connectionCount,
				close: () => new Promise((res) => server.close(() => res())),
			});
		});
	});
};

describe("Proxy", () => {
	describe("Option merging", () => {
		it("does not touch the fetch call when no proxy is configured", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 200 }));

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			await koolFetch("/foo");

			expect(requestFn).toHaveBeenCalledTimes(1);
			expect(requestFn).toHaveBeenCalledWith(expect.any(Request));
		});

		it("disables a global proxy for a single request when set to false", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 200 }));

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				proxy: "http://127.0.0.1:1",
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			await koolFetch("/foo", { proxy: false } as RequestInit);

			expect(requestFn).toHaveBeenCalledTimes(1);
			expect(requestFn).toHaveBeenCalledWith(expect.any(Request));
		});
	});

	describe("Bun runtime (native)", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("calls fetch with a bare URL and Bun's documented proxy option", async () => {
			const fetchFn = vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 200 }));

			vi.stubGlobal("Bun", {});
			vi.stubGlobal("fetch", fetchFn);

			const unusedFetch = vi.fn();

			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: "http://proxy.internal:8080",
				fetch: unusedFetch as unknown as typeof globalThis.fetch,
			});

			await koolFetch("/some/path");

			expect(unusedFetch).not.toHaveBeenCalled();
			expect(fetchFn).toHaveBeenCalledWith(
				"http://example.com/some/path",
				expect.objectContaining({
					method: "GET",
					proxy: "http://proxy.internal:8080",
				}),
			);
		});

		it("forwards signal, credentials, cache, integrity, keepalive, referrer, referrerPolicy, and mode", async () => {
			const fetchFn = vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 200 }));

			vi.stubGlobal("Bun", {});
			vi.stubGlobal("fetch", fetchFn);

			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: "http://proxy.internal:8080",
			});

			const controller = new AbortController();

			await koolFetch("/some/path", {
				signal: controller.signal,
				credentials: "include",
				cache: "no-store",
				integrity: "sha256-abc",
				keepalive: true,
				referrer: "http://ref.example",
				referrerPolicy: "no-referrer",
				mode: "cors",
			} as RequestInit);

			expect(fetchFn).toHaveBeenCalledWith(
				"http://example.com/some/path",
				expect.objectContaining({
					credentials: "include",
					cache: "no-store",
					integrity: "sha256-abc",
					keepalive: true,
					referrer: "http://ref.example/",
					referrerPolicy: "no-referrer",
					mode: "cors",
				}),
			);

			const forwardedSignal = fetchFn.mock.calls[0]?.[1]?.signal;
			expect(forwardedSignal).toBeInstanceOf(AbortSignal);
			expect(forwardedSignal.aborted).toBe(false);
			controller.abort();
			expect(forwardedSignal.aborted).toBe(true);
		});
	});

	describe("Deno runtime", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("builds a Deno.createHttpClient dispatch, reuses it across requests, and uses the global fetch directly", async () => {
			const fakeClient = { fake: "deno-client" };
			const createHttpClient = vi.fn().mockReturnValue(fakeClient);
			const fetchFn = vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 200 }));

			vi.stubGlobal("Bun", undefined);
			vi.stubGlobal("Deno", { createHttpClient });
			vi.stubGlobal("fetch", fetchFn);

			// A distinct, unmocked `fetch` option to prove the proxy path bypasses
			// it rather than layering the client on top of it.
			const unusedFetch = vi.fn();

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				proxy: "http://proxy.internal:8080",
				fetch: unusedFetch as unknown as typeof globalThis.fetch,
			});

			await koolFetch("/one");
			await koolFetch("/two");

			expect(createHttpClient).toHaveBeenCalledTimes(1);
			expect(createHttpClient).toHaveBeenCalledWith({
				proxy: { url: "http://proxy.internal:8080" },
			});
			expect(unusedFetch).not.toHaveBeenCalled();
			expect(fetchFn).toHaveBeenCalledTimes(2);
			expect(fetchFn).toHaveBeenNthCalledWith(
				1,
				"https://example.com/one",
				expect.objectContaining({ client: fakeClient }),
			);
		});
	});

	describe("Node / undici fallback", () => {
		let proxy: Awaited<ReturnType<typeof startProxyServer>>;

		beforeAll(async () => {
			proxy = await startProxyServer();
		});

		afterAll(() => proxy.close());

		beforeEach(() => {
			// Force the "neither Bun nor Deno" branch even though the test
			// runner itself is Bun, so the real undici ProxyAgent path runs.
			vi.stubGlobal("Bun", undefined);
			vi.stubGlobal("Deno", undefined);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			proxy.requests.length = 0;
			proxy.receivedRequests.length = 0;
		});

		it("routes the request through the configured HTTP proxy", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const response = await koolFetch("/some/path");
			const body = await response.json();

			expect(body).toEqual({ viaProxy: true });
			expect(proxy.requests).toEqual(["http://example.com/some/path"]);
		});

		it("forwards method, headers, and a JSON body through the proxy unchanged", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const payload = { id: 42, name: "Hello" };

			await koolFetch("/echo", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-custom-header": "some-value",
				},
				body: JSON.stringify(payload),
			});

			expect(proxy.receivedRequests).toHaveLength(1);
			const [received] = proxy.receivedRequests;

			expect(received?.method).toBe("POST");
			expect(received?.url).toBe("http://example.com/echo");
			expect(received?.headers["content-type"]).toBe("application/json");
			expect(received?.headers["x-custom-header"]).toBe("some-value");
			expect(JSON.parse(received?.body.toString("utf8") ?? "")).toEqual(
				payload,
			);
		});

		it("round-trips the response body and headers the proxy sends back", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const payload = { hello: "world" };

			const response = await koolFetch("/echo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});

			expect(response.headers.get("content-type")).toBe("application/json");

			const body = await response.json();
			expect(body).toEqual({
				method: "POST",
				headers: expect.objectContaining({
					"content-type": "application/json",
				}),
				body: JSON.stringify(payload),
			});
		});

		it.each(["PUT", "PATCH", "DELETE"])(
			"forwards a %s request with a body through the proxy",
			async (method) => {
				const koolFetch = createKoolFetch({
					baseURL: "http://example.com",
					proxy: proxy.url,
				});

				await koolFetch("/echo", {
					method,
					headers: { "content-type": "text/plain" },
					body: "some-body",
				});

				const [received] = proxy.receivedRequests;
				expect(received?.method).toBe(method);
				expect(received?.body.toString("utf8")).toBe("some-body");
			},
		);

		it("forwards a body with multi-byte UTF-8 characters without corrupting it", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const payload = "héllo wörld 😀";

			await koolFetch("/echo", {
				method: "POST",
				headers: { "content-type": "text/plain; charset=utf-8" },
				body: payload,
			});

			const [received] = proxy.receivedRequests;
			expect(received?.body.toString("utf8")).toBe(payload);
		});

		it("does not send a body for a GET request", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			await koolFetch("/echo");

			const [received] = proxy.receivedRequests;
			expect(received?.method).toBe("GET");
			expect(received?.body).toHaveLength(0);
		});

		it("aborts a proxied request when its AbortSignal fires", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const controller = new AbortController();
			setTimeout(() => controller.abort(), 50);

			const start = Date.now();
			await expect(
				koolFetch("/slow", { signal: controller.signal }),
			).rejects.toThrow();

			// The proxy's own handler waits 500ms before responding — aborting
			// well before that proves the signal was actually forwarded and
			// honored, rather than the request just running to completion.
			expect(Date.now() - start).toBeLessThan(400);
		});

		it("does not abort a proxied request when no signal is provided", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const response = await koolFetch("/slow");
			expect(response.status).toBe(200);
		});

		it('reads a JSON body through the proxy via unwrap("json")', async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			const payload = { id: 1, ok: true };

			const body = await koolFetch("/echo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}).unwrap("json");

			expect(body).toEqual({
				method: "POST",
				headers: expect.objectContaining({
					"content-type": "application/json",
				}),
				body: JSON.stringify(payload),
			});
		});

		it("reuses a small, bounded set of proxy connections instead of opening a fresh one per request", async () => {
			const freshProxy = await startProxyServer();
			try {
				const koolFetch = createKoolFetch({
					baseURL: "http://example.com",
					proxy: freshProxy.url,
				});

				const before = freshProxy.connectionCount();
				const requestCount = 15;

				for (let i = 0; i < requestCount; i++) {
					// Consume each body (as any real caller reading a JSON/text
					// response would) so undici's pool sees the connection as
					// free and can hand it back out for the next request.
					await koolFetch(`/${i}`).unwrap("json");
				}

				// undici's Pool (used internally by ProxyAgent) spreads requests
				// across a handful of connections rather than serializing
				// through exactly one, so this isn't asserting "1" — it's
				// asserting the connection count plateaus instead of growing
				// 1:1 with every request, which is what a fresh ProxyAgent per
				// request (the regression this fix reverts) would do.
				expect(freshProxy.connectionCount() - before).toBeLessThan(
					requestCount,
				);
			} finally {
				await freshProxy.close();
			}
		});

		it("retries a POST request with a body without crashing on the second attempt", async () => {
			// A dedicated proxy instance so its /flaky counter starts fresh.
			const freshProxy = await startProxyServer();
			try {
				const koolFetch = createKoolFetch({
					baseURL: "http://example.com",
					proxy: freshProxy.url,
					retry: { retries: 1, methods: ["POST"], delay: 0 },
				});

				const payload = JSON.stringify({ attempt: 1 });

				const response = await koolFetch("/flaky", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: payload,
				});

				expect(response.status).toBe(200);
				const body = await response.json();
				expect(body).toEqual({ body: payload });
			} finally {
				await freshProxy.close();
			}
		});

		it("drops a broken proxy tunnel and recovers on the next request", async () => {
			// A closed port: the first request fails fast (ECONNREFUSED) instead
			// of routing through the shared proxy server used by the other tests.
			const deadProxyURL = "http://127.0.0.1:1";
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: deadProxyURL,
			});

			await expect(koolFetch("/one")).rejects.toThrow();

			// Point the same koolFetch instance at the now-healthy proxy for a
			// per-request override, proving the earlier failure against
			// deadProxyURL didn't leave anything wedged for later requests.
			const response = await koolFetch("/two", {
				proxy: proxy.url,
			} as RequestInit);

			expect(response.status).toBe(200);
		});

		it("keeps the proxy connection alive across a non-2xx response instead of closing it", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			// throwOnHttpError (the default) rejects on a non-2xx response
			// without ever reading response.body — that must not tear down the
			// cached dispatcher, since it's shared with every other request
			// against this proxy.
			await expect(koolFetch("/fail")).rejects.toThrow();

			const before = proxy.connectionCount();
			await koolFetch("/one");

			expect(proxy.connectionCount() - before).toBe(0);
		});

		it("throws a clear error when undici cannot be loaded", async () => {
			vi.doMock("undici", () => {
				throw new Error("Cannot find module 'undici'");
			});
			vi.resetModules();

			const { createKoolFetch: freshCreateKoolFetch } = await import("../src");

			const koolFetch = freshCreateKoolFetch({
				baseURL: "http://example.com",
				proxy: proxy.url,
			});

			await expect(koolFetch("/some/path")).rejects.toThrow(
				/requires the `undici` package/,
			);

			vi.doUnmock("undici");
			vi.resetModules();
		});
	});
});
