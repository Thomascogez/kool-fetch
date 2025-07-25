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
	http.get("https://example.com/400", () => {
		return HttpResponse.json(
			{ message: "ok" },
			{ status: 400, statusText: "Bad Request" },
		);
	}),
	http.get("https://example.com/500", () => {
		return HttpResponse.json(
			{ message: "ok" },
			{ status: 500, statusText: "Internal Server Error" },
		);
	}),
	http.get("https://example.com/authed", ({ request }) => {
		if (request.headers.get("Authorization") !== "authorized") {
			return HttpResponse.json(
				{ message: "unauthorized" },
				{ status: 401, statusText: "Unauthorized" },
			);
		}
		return HttpResponse.json({ message: "ok" }, { status: 200 });
	}),
];

const server = setupServer(...restHandlers);

describe("kool-fetch", () => {
	beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

	afterAll(() => server.close());

	afterEach(() => server.resetHandlers());

	describe("Create kool Fetch instance", () => {
		it("should create a kool fetch instance without any options", () => {
			expect(createKoolFetch()).toBeDefined();
		});

		it("should create a kool fetch instance with options", () => {
			expect(
				createKoolFetch({
					baseURL: "https://example.com",
					init: {
						headers: {
							Authorization: "Bearer 1234567890",
						},
					},
					throwOnHttpError: true,
					httpErrorFactory: (response) => {
						return new Error(response.statusText);
					},
				}),
			).toBeDefined();
		});
	});

	describe("Instance without default url", () => {
		it("should not send a request without providing a baseURL and endpoint is not a valid URL", async () => {
			const koolFetch = createKoolFetch();

			await expect(() => koolFetch("/200")).rejects.toThrowError();
		});
		it("should send a request without providing a baseURL and endpoint is a valid URL", async () => {
			const koolFetch = createKoolFetch();

			const response = await koolFetch("https://example.com/200");
			expect(response.status).toBe(200);
		});
	});

	describe("Instance with throwOnHttpError enabled", () => {
		it("should not throw an error when the response is ok", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
			});

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
		});

		it("should throw an error when the response is not ok (400)", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
			});

			await expect(koolFetch("/400")).rejects.toThrowError("Bad Request");
		});

		it("should throw an error when the response is not ok (500)", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
			});

			await expect(koolFetch("/500")).rejects.toThrowError(
				"Internal Server Error",
			);
		});
	});

	describe("Instance with throwOnHttpError enabled and custom httpErrorFactory", () => {
		class HttpError extends Error {}

		it("should not throw an error when the response is ok", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
				httpErrorFactory: (response) => {
					return new HttpError(response.statusText);
				},
			});

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
		});

		it("should throw an error when the response is not ok (400)", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
				httpErrorFactory: (response) => {
					return new HttpError(response.statusText);
				},
			});

			await expect(koolFetch("/400")).rejects.toThrowError(HttpError);
		});

		it("should throw an error when the response is not ok (500)", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				throwOnHttpError: true,
				httpErrorFactory: (response) => {
					return new HttpError(response.statusText);
				},
			});

			await expect(koolFetch("/500")).rejects.toThrowError(HttpError);
		});
	});

	describe("Instance with default request init", () => {
		it("should send request with default init", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				init: {
					headers: {
						Authorization: "authorized",
					},
				},
			});

			const response = await koolFetch("/authed");
			expect(response.status).toBe(200);
		});

		it("should erase the default init when providing a request init when making a request", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
				init: {
					headers: {
						Authorization: "Bearer 1234567890",
					},
				},
			});

			const response = await koolFetch("/authed", {
				method: "GET",
				headers: {
					Authorization: "authorized",
				},
			});
			expect(response.status).toBe(200);
		});
	});

	describe("Instance with request interceptors", () => {
		it("should make a request with an request interceptor", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const requestInterceptor = (request: Request) => {
				return request;
			};

			const spiedRequestInterceptor = vi.fn(requestInterceptor);
			koolFetch.addInterceptor("request", spiedRequestInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);

			expect(spiedRequestInterceptor).toHaveBeenCalledOnce();
		});

		it("should make a request with multiple request interceptors", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
			});

			const firstRequestInterceptor = (request: Request) => {
				return request;
			};

			const spiedFirstRequestInterceptor = vi.fn(firstRequestInterceptor);
			koolFetch.addInterceptor("request", spiedFirstRequestInterceptor);

			const secondRequestInterceptor = (request: Request) => {
				return request;
			};

			const spiedSecondRequestInterceptor = vi.fn(secondRequestInterceptor);
			koolFetch.addInterceptor("request", spiedSecondRequestInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);

			expect(spiedFirstRequestInterceptor).toHaveBeenCalledOnce();
			expect(spiedSecondRequestInterceptor).toHaveBeenCalledOnce();
			expect(spiedFirstRequestInterceptor).toHaveBeenCalledBefore(
				spiedSecondRequestInterceptor,
			);
		});

		it("should make a request with a request interceptor that modifies the original request", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const requestInterceptor = (request: Request) => {
				return new Request(request.url, {
					...request,
					headers: {
						...request.headers,
						Authorization: "authorized",
					},
				});
			};

			const spiedRequestInterceptor = vi.fn(requestInterceptor);
			koolFetch.addInterceptor("request", spiedRequestInterceptor);

			const response = await koolFetch("/authed");
			expect(response.status).toBe(200);
			expect(spiedRequestInterceptor).toHaveBeenCalledOnce();
		});
	});

	describe("Remove request interceptor", () => {
		it("should remove an non-existing request interceptor and should not have any effect", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const requestInterceptor = (request: Request) => {
				return request;
			};

			const spiedRequestInterceptor = vi.fn(requestInterceptor);
			koolFetch.addInterceptor("request", spiedRequestInterceptor);
			koolFetch.removeInterceptor("request", vi.fn());

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedRequestInterceptor).toHaveBeenCalledOnce();
		});

		it("should remove the request interceptor and it should not be called", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const requestInterceptor = (request: Request) => {
				return request;
			};

			const spiedRequestInterceptor = vi.fn(requestInterceptor);
			koolFetch.addInterceptor("request", spiedRequestInterceptor);
			koolFetch.removeInterceptor("request", spiedRequestInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedRequestInterceptor).not.toHaveBeenCalled();
		});

		it("should remove a request interceptor and other should still be called", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const fistRequestInterceptor = (request: Request) => {
				return request;
			};

			const spiedFirstRequestInterceptor = vi.fn(fistRequestInterceptor);
			koolFetch.addInterceptor("request", spiedFirstRequestInterceptor);
			koolFetch.removeInterceptor("request", spiedFirstRequestInterceptor);

			const secondRequestInterceptor = (request: Request) => {
				return request;
			};

			const spiedSecondRequestInterceptor = vi.fn(secondRequestInterceptor);
			koolFetch.addInterceptor("request", spiedSecondRequestInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedFirstRequestInterceptor).not.toHaveBeenCalled();
			expect(spiedSecondRequestInterceptor).toHaveBeenCalledOnce();
		});
	});

	describe("Instance with response interceptors", () => {
		it("should make a request with an response interceptor", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const responseInterceptor = (response: Response) => {
				return response;
			};

			const spiedResponseInterceptor = vi.fn(responseInterceptor);
			koolFetch.addInterceptor("response", spiedResponseInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedResponseInterceptor).toHaveBeenCalledOnce();
		});

		it("should make a request with multiple response interceptors", async () => {
			const koolFetch = createKoolFetch({
				baseURL: "https://example.com",
			});

			const firstResponseInterceptor = (response: Response) => {
				return response;
			};

			const spiedFirstResponseInterceptor = vi.fn(firstResponseInterceptor);
			koolFetch.addInterceptor("response", spiedFirstResponseInterceptor);

			const secondResponseInterceptor = (response: Response) => {
				return response;
			};

			const spiedSecondResponseInterceptor = vi.fn(secondResponseInterceptor);
			koolFetch.addInterceptor("response", spiedSecondResponseInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);

			expect(spiedFirstResponseInterceptor).toHaveBeenCalledOnce();
			expect(spiedSecondResponseInterceptor).toHaveBeenCalledOnce();
			expect(spiedFirstResponseInterceptor).toHaveBeenCalledBefore(
				spiedSecondResponseInterceptor,
			);
		});

		it("should make a request with a response interceptor that modifies the original response", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const responseInterceptor = (response: Response) => {
				return new Response(JSON.stringify({ message: "modified" }), response);
			};

			const spiedResponseInterceptor = vi.fn(responseInterceptor);
			koolFetch.addInterceptor("response", spiedResponseInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedResponseInterceptor).toHaveBeenCalledOnce();
			expect(await response.json()).toEqual({ message: "modified" });

			expect(spiedResponseInterceptor).toHaveBeenCalledOnce();
		});
	});

	describe("Remove response interceptor", () => {
		it("should remove an non-existing response interceptor and should not have any effect", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const responseInterceptor = (response: Response) => {
				return response;
			};

			const spiedResponseInterceptor = vi.fn(responseInterceptor);
			koolFetch.addInterceptor("response", spiedResponseInterceptor);
			koolFetch.removeInterceptor("response", vi.fn());

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedResponseInterceptor).toHaveBeenCalledOnce();
		});

		it("should remove the response interceptor and it should not be called", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const responseInterceptor = (response: Response) => {
				return response;
			};

			const spiedResponseInterceptor = vi.fn(responseInterceptor);
			koolFetch.addInterceptor("response", spiedResponseInterceptor);
			koolFetch.removeInterceptor("response", spiedResponseInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedResponseInterceptor).not.toHaveBeenCalled();
		});

		it("should remove a response interceptor and other should still be called", async () => {
			const koolFetch = createKoolFetch({ baseURL: "https://example.com" });

			const fistResponseInterceptor = (response: Response) => {
				return response;
			};

			const spiedFirstResponseInterceptor = vi.fn(fistResponseInterceptor);
			koolFetch.addInterceptor("response", spiedFirstResponseInterceptor);
			koolFetch.removeInterceptor("response", spiedFirstResponseInterceptor);

			const secondResponseInterceptor = (response: Response) => {
				return response;
			};

			const spiedSecondResponseInterceptor = vi.fn(secondResponseInterceptor);
			koolFetch.addInterceptor("response", spiedSecondResponseInterceptor);

			const response = await koolFetch("/200");
			expect(response.status).toBe(200);
			expect(spiedFirstResponseInterceptor).not.toHaveBeenCalled();
			expect(spiedSecondResponseInterceptor).toHaveBeenCalledOnce();
		});
	});
});
