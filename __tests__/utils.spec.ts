import { describe, expect, it } from "vitest";
import { buildRequestURL, joinPathNames, mergeRequestInit } from "../src/utils";

describe("utils", () => {
	describe("joinPathNames", () => {
		it("should correctly join path names removing double slashes", () => {
			const pathName = ["a", "/b/c//", "/d", "e"];
			expect(joinPathNames(...pathName)).toBe("a/b/c/d/e");
		});

		it("should correctly join path names ignoring sparse array values", () => {
			const pathName = ["a", "/b/c//", "/d", " ", "", "e"];
			expect(joinPathNames(...pathName)).toBe("a/b/c/d/e");
		});
	});

	describe("buildRequestURL", () => {
		it("should not build a request URL when not having a baseURL and pathNameOrURL is a valid URL", () => {
			expect(() => buildRequestURL("", "/a/b/c")).toThrowError();
		});

		it("should build a request URL when not having a baseURL and pathNameOrURL is a valid URL", () => {
			expect(buildRequestURL("", "https://example.com/a/b/c").toString()).toBe(
				"https://example.com/a/b/c",
			);
		});

		it("should build a request URL when having a string baseURL", () => {
			expect(buildRequestURL("https://example.com", "/a/b/c").toString()).toBe(
				"https://example.com/a/b/c",
			);
		});

		it("should build a request URL when having a string baseURL with a trailing slash", () => {
			expect(
				buildRequestURL("https://example.com/base-path/", "/a/b/c").toString(),
			).toBe("https://example.com/base-path/a/b/c");
		});

		it("should build a request URL when having a string baseURL with a path", () => {
			expect(
				buildRequestURL("https://example.com/base-path", "/a/b/c").toString(),
			).toBe("https://example.com/base-path/a/b/c");
		});

		it("should build a request URL when having a URL baseURL", () => {
			expect(
				buildRequestURL(new URL("https://example.com"), "/a/b/c").toString(),
			).toBe("https://example.com/a/b/c");
		});

		it("should build a request URL when having a URL baseURL with a trailing slash", () => {
			expect(
				buildRequestURL(
					new URL("https://example.com/base-path/"),
					"/a/b/c",
				).toString(),
			).toBe("https://example.com/base-path/a/b/c");
		});

		it("should build a request URL when having a URL baseURL with a path", () => {
			expect(
				buildRequestURL(
					new URL("https://example.com/base-path"),
					"/a/b/c",
				).toString(),
			).toBe("https://example.com/base-path/a/b/c");
		});

		it("should correctly build a request URL when having a URL baseURL with a path and a query string", () => {
			expect(
				buildRequestURL(
					new URL("https://example.com/base-path"),
					"/a/b/c?a=1&b=2",
				).toString(),
			).toBe("https://example.com/base-path/a/b/c?a=1&b=2");
		});
	});

	describe("mergeRequestInit", () => {
		it("should merge two request init objects", () => {
			const init1 = {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			};
			const init2 = {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer 1234567890",
				},
			};

			const mergedInit = mergeRequestInit(init1, init2);

			expect(mergedInit).to.deep.equal({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer 1234567890",
				},
			});
		});

		it("should deep-merge headers preserving non-conflicting keys from earlier inits", () => {
			const global = {
				headers: {
					Authorization: "Bearer token",
					"X-Global": "1",
				},
			};
			const request = {
				headers: {
					"Content-Type": "application/json",
				},
			};

			const mergedInit = mergeRequestInit(global, request);

			expect(mergedInit).to.deep.equal({
				headers: {
					Authorization: "Bearer token",
					"X-Global": "1",
					"Content-Type": "application/json",
				},
			});
		});

		it("should let later init override earlier init on conflicting header keys", () => {
			const global = {
				headers: {
					Authorization: "Bearer token",
					"X-Global": "1",
				},
			};
			const request = {
				headers: {
					Authorization: "Bearer override",
				},
			};

			const mergedInit = mergeRequestInit(global, request);

			expect(mergedInit).to.deep.equal({
				headers: {
					Authorization: "Bearer override",
					"X-Global": "1",
				},
			});
		});

		it("should merge headers given as arrays of tuples without nesting", () => {
			const global: RequestInit = {
				headers: [
					["X-Global", "1"],
					["X-Other", "2"],
				],
			};
			const request: RequestInit = {
				headers: [["X-Request", "3"]],
			};

			const mergedInit = mergeRequestInit(global, request);

			expect(mergedInit).to.deep.equal({
				headers: {
					"X-Global": "1",
					"X-Other": "2",
					"X-Request": "3",
				},
			});
		});

		it("should merge headers given as a Headers instance", () => {
			const global = {
				headers: new Headers({
					Authorization: "Bearer token",
					"X-Global": "1",
				}),
			};
			const request = {
				headers: new Headers({ "Content-Type": "application/json" }),
			};

			const mergedInit = mergeRequestInit(global, request);

			expect(mergedInit).to.deep.equal({
				headers: {
					authorization: "Bearer token",
					"x-global": "1",
					"content-type": "application/json",
				},
			});
		});

		it("should keep last value for non-headers fields (method, body, mode)", () => {
			const global: RequestInit = { method: "GET", mode: "cors" };
			const request: RequestInit = { method: "POST", body: "hello" };

			const mergedInit = mergeRequestInit(global, request);

			expect(mergedInit).to.deep.equal({
				method: "POST",
				mode: "cors",
				body: "hello",
			});
		});

		it("should not inject an empty headers object when no init provides headers", () => {
			const mergedInit = mergeRequestInit({ method: "GET" }, { body: "hello" });

			expect(mergedInit).to.deep.equal({
				method: "GET",
				body: "hello",
			});
			expect(mergedInit).to.not.have.property("headers");
		});

		it("should return an empty object when given no inits", () => {
			expect(mergeRequestInit()).to.deep.equal({});
		});
	});
});
