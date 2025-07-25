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

		it("should build a request URl when having a URL baseURL", () => {
			expect(
				buildRequestURL(new URL("https://example.com"), "/a/b/c").toString(),
			).toBe("https://example.com/a/b/c");
		});

		it("should build a request URl when having a URL baseURL with a trailing slash", () => {
			expect(
				buildRequestURL(
					new URL("https://example.com/base-path/"),
					"/a/b/c",
				).toString(),
			).toBe("https://example.com/base-path/a/b/c");
		});

		it("should build a request URl when having a URL baseURL with a path", () => {
			expect(
				buildRequestURL(
					new URL("https://example.com/base-path"),
					"/a/b/c",
				).toString(),
			).toBe("https://example.com/base-path/a/b/c");
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
	});
});
