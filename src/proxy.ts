import type { ProxyAgent } from "undici";

export type ProxyOption = string | URL;

type ProxyDispatch = {
	execute: (request: Request) => Promise<Response>;
};

const getGlobal = (name: string): unknown =>
	(globalThis as Record<string, unknown>)[name];

const denoHttpClients = new Map<string, unknown>();
const undiciProxyAgents = new Map<string, InstanceType<typeof ProxyAgent>>();
// biome-ignore lint/suspicious/noExplicitAny: runtime-specific types
let undiciModulePromise: Promise<any> | null = null;

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
			signal: request.signal,
			credentials: request.credentials,
			cache: request.cache,
			integrity: request.integrity,
			keepalive: request.keepalive,
			referrer: request.referrer,
			referrerPolicy: request.referrerPolicy,
			mode: request.mode,
			duplex: request.duplex,
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

			// Cached per proxy URL and reused across requests (mirrors the Deno
			// client cache above) so a proxied request only pays for a new
			// DNS lookup + TCP/TLS handshake to the proxy when it actually needs
			// one, instead of on every single call.
			const dispatcher: InstanceType<typeof ProxyAgent> =
				undiciProxyAgents.get(proxyURL) ?? new undici.ProxyAgent(proxyURL);

			undiciProxyAgents.set(proxyURL, dispatcher);

			try {
				return await undici.fetch(url, { ...init, dispatcher });
			} catch (cause) {
				// The cached tunnel may be the thing that's actually broken (a
				// stalled or silently dropped connection, surfaced here as a
				// connection error or undici's own header/body timeout) — drop
				// it so the next request builds a fresh one instead of
				// repeatedly retrying the same dead tunnel.
				if (undiciProxyAgents.get(proxyURL) === dispatcher) {
					undiciProxyAgents.delete(proxyURL);
				}
				dispatcher.close().catch(() => {});
				throw cause;
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
