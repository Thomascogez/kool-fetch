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

	endpointURL.pathname = joinPathNames(endpointURL.pathname, pathNameOrURL);

	return endpointURL;
};

export const mergeRequestInit = (...inits: RequestInit[]): RequestInit => {
	const mergedInit: RequestInit = {};

	for (const init of inits) {
		for (const [key, value] of Object.entries(init)) {
			const existingValue = mergedInit[key as keyof RequestInit];

			if (Array.isArray(existingValue)) {
				Object.assign(mergedInit, { [key]: [...existingValue, value] });
			} else {
				Object.assign(mergedInit, { [key]: value });
			}
		}
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
