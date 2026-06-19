export const joinPathNames = (...names: string[]) => {
	return names
		.map((name) => name.trim())
		.filter(Boolean)
		.join("/")
		.replaceAll(/\/+/g, "/");
};

const isValidURL = (url: string) => {
	try {
		new URL(url);
		return true;
	} catch (_e) {
		return false;
	}
};

export const buildRequestURL = (
	baseURL: string | URL,
	pathNameOrURL: string,
) => {
	if (!baseURL) {
		return new URL(pathNameOrURL).toString();
	}

	const endpointURL = new URL(baseURL);

	if (isValidURL(pathNameOrURL)) {
		return new URL(pathNameOrURL, endpointURL).toString();
	}

	const parsedPathName = new URL(pathNameOrURL, endpointURL);

	endpointURL.pathname = joinPathNames(
		endpointURL.pathname,
		parsedPathName.pathname,
	);

	if (parsedPathName.searchParams.size > 0) {
		for (const [key, value] of parsedPathName.searchParams) {
			endpointURL.searchParams.append(key, value);
		}
	}

	if (parsedPathName.hash) {
		endpointURL.hash = parsedPathName.hash;
	}

	return endpointURL;
};

// Normalizes any HeadersInit (Record, string[][], Headers) into a flat
// Record<string, string>, preserving the original key casing for Record and
// array-of-tuples formats. Headers instances lowercase keys inherently per
// platform spec; that normalization is preserved here.
const normalizeHeaders = (input: unknown): Record<string, string> => {
	if (input == null) {
		return {};
	}

	if (typeof Headers !== "undefined" && input instanceof Headers) {
		const out: Record<string, string> = {};
		input.forEach((value, key) => {
			out[key] = value;
		});
		return out;
	}

	if (Array.isArray(input)) {
		const out: Record<string, string> = {};
		for (const entry of input) {
			if (Array.isArray(entry) && entry.length >= 2) {
				out[String(entry[0])] = String(entry[1]);
			}
		}
		return out;
	}

	if (typeof input === "object") {
		return { ...(input as Record<string, string>) };
	}

	return {};
};

export const mergeRequestInit = (...inits: RequestInit[]): RequestInit => {
	const mergedInit: RequestInit = {};
	let mergedHeaders: Record<string, string> = {};

	for (const init of inits) {
		for (const [key, value] of Object.entries(init)) {
			if (key === "headers") {
				// Deep-merge headers so non-conflicting global headers are preserved
				// while conflicting keys are overridden by the later (request-level) init.
				mergedHeaders = { ...mergedHeaders, ...normalizeHeaders(value) };
			} else {
				// All other RequestInit fields are single-valued; latest wins.
				(mergedInit as Record<string, unknown>)[key] = value;
			}
		}
	}

	if (Object.keys(mergedHeaders).length > 0) {
		mergedInit.headers = mergedHeaders;
	}

	return mergedInit;
};

export const tryCatch = async <T, V = Error>(
	promise: Promise<T>,
): Promise<[T, undefined] | [undefined, V]> => {
	try {
		const resolvedPromise = await promise;
		return [resolvedPromise, undefined];
	} catch (error) {
		return [undefined, error as V];
	}
};
