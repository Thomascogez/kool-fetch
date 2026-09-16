import type * as undici from "undici";

export type ProxyOption = string | URL;

type ProxyDispatch = {
	execute: (request: Request) => Promise<Response>;
};

const getGlobal = (name: string): unknown =>
	(globalThis as Record<string, unknown>)[name];

const denoHttpClients = new Map<string, unknown>();
let undiciModulePromise: Promise<typeof undici> | null = null;

const normalizeProxyURL = (proxy: ProxyOption): string =>
	proxy instanceof URL ? proxy.toString() : proxy;

// Some runtimes only read their proxy-related fetch extension when fetch()
// is called with a bare URL, ignoring it entirely when the first argument is
// a Request object (even one constructed with the field already set) — this
// was confirmed for Bun. Passing plain (url, init) args instead sidesteps
// that everywhere rather than trusting undocumented per-runtime behavior.
const toFetchArgs = async (
	request: Request,
): Promise<[string, RequestInit]> => {
	const body = request.body ? await request.arrayBuffer() : undefined;

	return [
		request.url,
		{
			method: request.method,
			headers: Array.from(request.headers.entries()),
			body,
			redirect: request.redirect,
		},
	];
};

// Bun's fetch natively understands a `proxy` init option passed alongside a
// URL string.
const resolveBunProxyDispatch = (proxyURL: string): ProxyDispatch => ({
	execute: async (request) => {
		const [url, init] = await toFetchArgs(request);
		return globalThis.fetch(url, { ...init, proxy: proxyURL } as RequestInit);
	},
});

// Deno's fetch takes a `client` created from Deno.createHttpClient. Clients
// are cached per proxy URL so repeated requests reuse the same connection pool.
const resolveDenoProxyDispatch = (proxyURL: string): ProxyDispatch => {
	let client = denoHttpClients.get(proxyURL);

	if (!client) {
		// biome-ignore lint/suspicious/noExplicitAny: Deno global has no ambient types in this project
		const deno = getGlobal("Deno") as any;
		client = deno.createHttpClient({ proxy: { url: proxyURL } });
		denoHttpClients.set(proxyURL, client);
	}

	return {
		execute: async (request) => {
			const [url, init] = await toFetchArgs(request);
			return globalThis.fetch(url, { ...init, client } as RequestInit);
		},
	};
};

const loadUndici = () => {
	if (!undiciModulePromise) {
		undiciModulePromise = import("undici");
	}
	return undiciModulePromise;
};

const resolveUndiciProxyDispatch = async (
	proxyURL: string,
): Promise<ProxyDispatch> => {
	let undici: Awaited<ReturnType<typeof loadUndici>>;

	try {
		undici = await loadUndici();
	} catch (cause) {
		throw new Error(
			"kool-fetch: the `proxy` option requires the `undici` package in this environment. " +
				"Install it with `npm install undici`, or provide your own proxy-aware `fetch` via the `fetch` option instead.",
			{ cause },
		);
	}

	return {
		execute: async (request) => {
			const [url, init] = await toFetchArgs(request);
			const dispatcher = new undici.ProxyAgent(proxyURL);

			try {
				return await undici.fetch(url, { ...init, dispatcher });
			} finally {
				// close() waits for the in-flight request (including a still-
				// streaming response body) to finish before tearing the socket
				// down, so this is safe to fire without awaiting it here.
				dispatcher.close().catch(() => {});
			}
		},
	};
};

export const resolveProxyDispatch = (
	proxy: ProxyOption,
): Promise<ProxyDispatch> | ProxyDispatch => {
	const proxyURL = normalizeProxyURL(proxy);

	if (typeof getGlobal("Bun") !== "undefined") {
		return resolveBunProxyDispatch(proxyURL);
	}

	if (typeof getGlobal("Deno") !== "undefined") {
		return resolveDenoProxyDispatch(proxyURL);
	}

	return resolveUndiciProxyDispatch(proxyURL);
};
