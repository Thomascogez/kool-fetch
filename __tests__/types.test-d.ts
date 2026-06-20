import { describe, expectTypeOf, test } from "vitest";
import { createKoolFetch } from "../src";
import { mergeRequestInit, tryCatch } from "../src/utils";

const kf = createKoolFetch({ baseURL: "https://example.com" });

describe("tryCatch", () => {
	test("returns golang-style tuple [T, undefined] | [undefined, Error]", async () => {
		const result = await tryCatch(Promise.resolve(42));
		expectTypeOf(result).toEqualTypeOf<
			[number, undefined] | [undefined, Error]
		>();
	});

	test("custom error type via second generic", async () => {
		const result = await tryCatch<number, TypeError>(Promise.resolve(42));
		expectTypeOf(result).toEqualTypeOf<
			[number, undefined] | [undefined, TypeError]
		>();
	});

	test("destructuring gives resolved value | undefined and error | undefined", async () => {
		const [data, err] = await tryCatch(Promise.resolve("hello"));
		expectTypeOf(data).toEqualTypeOf<string | undefined>();
		expectTypeOf(err).toEqualTypeOf<Error | undefined>();
	});
});

describe("mergeRequestInit", () => {
	test("returns RequestInit", () => {
		const merged = mergeRequestInit(
			{ method: "GET" },
			{ headers: { Authorization: "Bearer token" } },
		);
		expectTypeOf(merged).toExtend<RequestInit>();
	});

	test("accepts variadic RequestInit arguments", () => {
		const merged = mergeRequestInit(
			{ method: "GET" },
			{ headers: { A: "1" } },
			{ body: "hello" },
		);
		expectTypeOf(merged).toExtend<RequestInit>();
	});
});

describe("createKoolFetch", () => {
	test("returns a callable KoolFetchInstance", () => {
		const instance = createKoolFetch();
		expectTypeOf(instance).toBeFunction();
		expectTypeOf(instance.addInterceptor).toBeFunction();
		expectTypeOf(instance.removeInterceptor).toBeFunction();
	});

	test("instance call returns a thenable builder", () => {
		const builder = kf("/x");
		expectTypeOf(builder).toExtend<Promise<Response>>();
	});

	test("accepts KoolFetchOptions", () => {
		const instance = createKoolFetch({
			baseURL: "https://example.com",
			throwOnHttpError: true,
			retry: { retries: 3, delay: 1000 },
			init: { headers: { Authorization: "Bearer token" } },
		});
		expectTypeOf(instance).toBeFunction();
	});
});

describe("KoolFetchRequestBuilder chaining", () => {
	test("addInterceptor('request', fn) returns builder for chaining", () => {
		const builder = kf("/x");
		const chained = builder.addInterceptor("request", (req) => req);
		expectTypeOf(chained).toExtend<Promise<Response>>();
	});

	test("addInterceptor('response', fn) returns builder for chaining", () => {
		const builder = kf("/x");
		const chained = builder.addInterceptor("response", (res) => res);
		expectTypeOf(chained).toExtend<Promise<Response>>();
	});

	test("removeInterceptor returns builder for chaining", () => {
		const handler = (req: Request) => req;
		const builder = kf("/x");
		const chained = builder.removeInterceptor("request", handler);
		expectTypeOf(chained).toExtend<Promise<Response>>();
	});

	test("multiple addInterceptor calls chain correctly", () => {
		const builder = kf("/x")
			.addInterceptor("request", (req) => req)
			.addInterceptor("response", (res) => res);
		expectTypeOf(builder).toExtend<Promise<Response>>();
	});

	test("request interceptor receives Request and returns Request | Promise<Request>", () => {
		kf("/x").addInterceptor("request", (req): Request => req);
		kf("/x").addInterceptor("request", async (req): Promise<Request> => req);
	});

	test("response interceptor receives Response + Request and returns Response | Promise<Response>", () => {
		kf("/x").addInterceptor("response", (res, _req): Response => res);
		kf("/x").addInterceptor(
			"response",
			async (res, _req): Promise<Response> => res,
		);
	});
});

describe("unwrap return types", () => {
	test("unwrap('json') resolves to unknown (not Promise<unknown>)", async () => {
		const data = await kf("/x").unwrap("json");
		expectTypeOf(data).toEqualTypeOf<unknown>();
	});

	test("unwrap('arrayBuffer') resolves to ArrayBuffer (not Promise<ArrayBuffer>)", async () => {
		const data = await kf("/x").unwrap("arrayBuffer");
		expectTypeOf(data).toEqualTypeOf<ArrayBuffer>();
	});

	test("unwrap('text') resolves to string", async () => {
		const data = await kf("/x").unwrap("text");
		expectTypeOf(data).toEqualTypeOf<string>();
	});

	test("unwrap('blob') resolves to Blob", async () => {
		const data = await kf("/x").unwrap("blob");
		expectTypeOf(data).toEqualTypeOf<Awaited<ReturnType<Response["blob"]>>>();
	});

	test("explicit generic is preserved and resolved", async () => {
		const data = await kf("/x").unwrap<{ id: number }>("json");
		expectTypeOf(data).toEqualTypeOf<{ id: number }>();
	});
});

describe("unwrapSafe tuple types", () => {
	test("unwrapSafe('arrayBuffer') left element is ArrayBuffer | undefined, not Promise", async () => {
		const [data, err] = await kf("/x").unwrapSafe("arrayBuffer");
		expectTypeOf(data).toEqualTypeOf<ArrayBuffer | undefined>();
		expectTypeOf(err).toEqualTypeOf<unknown>();
	});

	test("unwrapSafe('text') left element is string | undefined", async () => {
		const [data] = await kf("/x").unwrapSafe("text");
		expectTypeOf(data).toEqualTypeOf<string | undefined>();
	});

	test("unwrapSafe('blob') left element is Blob | undefined", async () => {
		const [data] = await kf("/x").unwrapSafe("blob");
		expectTypeOf(data).toEqualTypeOf<
			Awaited<ReturnType<Response["blob"]>> | undefined
		>();
	});

	test("unwrapSafe('json') left element is unknown (not Promise<unknown>)", async () => {
		const [data] = await kf("/x").unwrapSafe("json");
		expectTypeOf(data).toEqualTypeOf<unknown>();
	});

	test("explicit generic is preserved in left element", async () => {
		const [data] = await kf("/x").unwrapSafe<{ id: number }>("json");
		expectTypeOf(data).toEqualTypeOf<{ id: number } | undefined>();
	});

	test("custom error type via second generic", async () => {
		const [data, err] = await kf("/x").unwrapSafe<unknown, TypeError>("json");
		expectTypeOf(data).toEqualTypeOf<unknown>();
		expectTypeOf(err).toEqualTypeOf<TypeError | undefined>();
	});
});
