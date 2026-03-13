import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createKoolFetch } from "../src";

const restHandlers = [
	http.get("https://example.com/200", () => {
		return HttpResponse.json({ message: "ok" }, { status: 200 });
	}),
	http.get("https://example.com/500", () => {
		return HttpResponse.json({ message: "error" }, { status: 500 });
	}),
	http.get("https://example.com/503", () => {
		return HttpResponse.json(
			{ message: "service unavailable" },
			{ status: 503 },
		);
	}),
	http.get("https://example.com/flaky", () => {
		return HttpResponse.json({ message: "ok" }, { status: 200 });
	}),
];

const server = setupServer(...restHandlers);

describe("Retry", () => {
	beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
	afterAll(() => server.close());
	afterEach(() => server.resetHandlers());

	describe("Global retry config", () => {
		it("should retry on 500 status code with global retry enabled", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: true,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500");
			expect(response.status).toBe(200);
			expect(requestFn).toHaveBeenCalledTimes(2);
		});

		it("should not retry when global retry is disabled", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: false,
				throwOnHttpError: false,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500");
			expect(response.status).toBe(500);
			expect(requestFn).toHaveBeenCalledTimes(1);
		});

		it("should not retry for non-idempotent methods", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: true,
				throwOnHttpError: false,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500", { method: "POST" });
			expect(response.status).toBe(500);
			expect(requestFn).toHaveBeenCalledTimes(1);
		});

		it("should respect max retries from config", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: { retries: 2 },
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			await expect(koolFetch("/500")).rejects.toThrow();
			expect(requestFn).toHaveBeenCalledTimes(3);
		});
	});

	describe("Per-request retry override", () => {
		it("should disable retry per-request when global is enabled", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: true,
				throwOnHttpError: false,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500", { retry: false } as RequestInit);
			expect(response.status).toBe(500);
			expect(requestFn).toHaveBeenCalledTimes(1);
		});

		it("should enable retry per-request when global is disabled", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: false,
				throwOnHttpError: false,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500", {
				retry: { retries: 1 },
			} as RequestInit);
			expect(response.status).toBe(200);
			expect(requestFn).toHaveBeenCalledTimes(2);
		});

		it("should override retry config per-request", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: { retries: 1 },
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500", {
				retry: { retries: 1 },
			} as RequestInit);
			expect(response.status).toBe(200);
			expect(requestFn).toHaveBeenCalledTimes(2);
		});
	});

	describe("Retry delay", () => {
		it("should apply retry delay", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: { retries: 3, delay: 100 },
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const start = Date.now();
			await koolFetch("/500");
			const duration = Date.now() - start;

			expect(duration).toBeGreaterThanOrEqual(100);
		});

		it("should use retry delay function", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 500 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: {
					retries: 3,
					delay: (attempt: number) => 50 * attempt,
				},
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const start = Date.now();
			await koolFetch("/500");
			const duration = Date.now() - start;

			expect(duration).toBeGreaterThanOrEqual(50);
		});
	});

	describe("Retry statuses and methods", () => {
		it("should use custom retry statuses", async () => {
			const requestFn = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ message: "error" }), { status: 503 }),
				);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: { retries: 3, statusCodes: [503] },
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/503");
			expect(response.status).toBe(200);
			expect(requestFn).toHaveBeenCalledTimes(2);
		});

		it("should not retry 400 by default", async () => {
			const requestFn = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: "bad request" }), {
					status: 400,
				}),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: true,
				throwOnHttpError: false,
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const response = await koolFetch("/500");
			expect(response.status).toBe(400);
			expect(requestFn).toHaveBeenCalledTimes(1);
		});

		it("should pass response to delay function allowing Retry-After header usage", async () => {
			const requestFn = vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "error" }), {
					status: 503,
					headers: { "Retry-After": "2" },
				}),
			);
			requestFn.mockResolvedValueOnce(
				new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
			);

			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				retry: {
					retries: 3,
					delay: (_attempt, response) => {
						const retryAfter = response?.headers.get("Retry-After");
						if (retryAfter) return parseInt(retryAfter, 10) * 1000;
						return 0;
					},
				},
				fetch: requestFn as unknown as typeof globalThis.fetch,
			});

			const start = Date.now();
			await koolFetch("/503");
			const duration = Date.now() - start;

			expect(duration).toBeGreaterThanOrEqual(2000);
			expect(requestFn).toHaveBeenCalledTimes(2);
		});
	});
});
