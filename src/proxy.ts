export type ProxyOption = string | URL;

type ProxyDispatch = {
	execute: (request: Request) => Promise<Response>;
};

const getGlobal = (name: string): unknown =>
	(globalThis as Record<string, unknown>)[name];

const denoHttpClients = new Map<string, unknown>();
const undiciProxyAgents = new Map<string, unknown>();
// biome-ignore lint/suspicious/noExplicitAny: dynamically imported, shape is only known at runtime
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

// Fallback for every other environment (Node, Vercel Functions, Cloudflare
// Workers with nodejs_compat, ...). Uses undici's own fetch + ProxyAgent
// directly instead of the platform's fetch, since undici implements the HTTP
// protocol itself over node:net/node:tls rather than depending on a
// platform-level dispatcher hook. It also has its own Request/Response
// classes, so a Request built by a different runtime's global fetch isn't
// recognized — another reason toFetchArgs() unpacks to plain arguments first.
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

	let dispatcher = undiciProxyAgents.get(proxyURL);

	if (!dispatcher) {
		dispatcher = new undici.ProxyAgent(proxyURL);
		undiciProxyAgents.set(proxyURL, dispatcher);
	}

	return {
		execute: async (request) => {
			const [url, init] = await toFetchArgs(request);
			return undici.fetch(url, { ...init, dispatcher });
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
