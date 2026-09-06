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

// A minimal forward proxy: it never needs to actually reach "example.com"
// because a real forward proxy receives the absolute-form request itself and
// answers it directly, so this is enough to prove requests were routed
// through the proxy rather than sent directly.
const startProxyServer = () => {
	const requests: string[] = [];
	const server = http.createServer((req, res) => {
		requests.push(req.url ?? "");
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ viaProxy: true }));
	});

	return new Promise<{
		url: string;
		requests: string[];
		close: () => Promise<void>;
	}>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			resolve({
				url: `http://127.0.0.1:${port}`,
				requests,
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

		// vitest's test context doesn't route `fetch` through Bun's native
		// networking engine even when the process itself runs under `bun`
		// (confirmed against a real Bun-only script, outside vitest, where the
		// identical call does tunnel through a proxy) — so this is a unit test
		// of the call shape against Bun's documented `{ proxy }` extension,
		// rather than a real end-to-end tunnel like the undici fallback below.
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
