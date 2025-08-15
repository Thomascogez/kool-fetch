import type {
	ExtendedFetch,
	InterceptionOperationFN,
	KoolFetchInstance,
	KoolFetchOptions,
	RequestInterceptorFN,
	ResponseInterceptorFN,
} from "./types.js";
import { buildRequestURL, mergeRequestInit } from "./utils.js";

const applyRequestInterceptors = async (
	request: Request,
	requestInterceptors: Set<RequestInterceptorFN>,
) => {
	let interceptedRequest = request;

	for (const requestInterceptor of requestInterceptors) {
		interceptedRequest = await requestInterceptor(request);
	}

	return interceptedRequest;
};

const applyResponseInterceptors = async (
	response: Response,
	request: Request,
	responseInterceptors: Set<ResponseInterceptorFN>,
) => {
	let interceptedResponse = response;

	for (const responseInterceptor of responseInterceptors) {
		interceptedResponse = await responseInterceptor(
			interceptedResponse,
			request,
		);
	}

	return interceptedResponse;
};

const processResponse = async (
	request: Request,
	response: Response,
	responseInterceptors: Set<ResponseInterceptorFN>,
	options: KoolFetchOptions,
) => {
	const interceptedResponse = await applyResponseInterceptors(
		response,
		request,
		responseInterceptors,
	);

	if (options.throwOnHttpError && !interceptedResponse.ok) {
		const error = await options.httpErrorFactory?.(
			interceptedResponse,
			request,
		);
		throw error;
	}

	return interceptedResponse;
};

const createResponsePromiseProxyHandler = (
	request: Request,
	responseInterceptors: Set<ResponseInterceptorFN>,
	options: KoolFetchOptions,
): ProxyHandler<Promise<Response>> => {
	return {
		get(target, prop, receiver) {
			if (prop === "unwrap") {
				return async () => {
					const response = await target;
					const processedResponse = await processResponse(
						request,
						response,
						responseInterceptors,
						options,
					);

					return processedResponse.json();
				};
			}

			if (prop === "then") {
				return (
					onFulfilled?: (value: Response) => unknown,
					onRejected?: (reason: unknown) => unknown,
				) => {
					return target
						.then((value: Response) =>
							processResponse(request, value, responseInterceptors, options),
						)
						.then(onFulfilled, onRejected);
				};
			}

			if (prop === "catch" || prop === "finally") {
				const value = target[prop];
				return typeof value === "function" ? value.bind(target) : value;
			}
			return Reflect.get(target, prop, receiver);
		},
	};
};

const createFetchProxyHandler = (
	options: KoolFetchOptions,
): ProxyHandler<KoolFetchInstance> => {
	const requestInterceptors = new Set<RequestInterceptorFN>();
	const responseInterceptors = new Set<ResponseInterceptorFN>();
	return {
		apply: (target, thisArg, argArray) => {
			const [pathName, init] = argArray;
			const { baseURL, init: fetchInit } = options;

			const endpointURL = buildRequestURL(baseURL ?? "", pathName);
			const requestInit = mergeRequestInit(fetchInit ?? {}, init ?? {});

			const request = new Request(endpointURL.toString(), requestInit);

			const responsePromise = (async () => {
				const interceptedRequest = await applyRequestInterceptors(
					request,
					requestInterceptors,
				);
				return target.apply(thisArg, [interceptedRequest]);
			})();

			return new Proxy(
				responsePromise,
				createResponsePromiseProxyHandler(
					request,
					responseInterceptors,
					options,
				),
			);
		},
		get(target, key) {
			if (key === "addInterceptor") {
				const addInterceptorFN: InterceptionOperationFN = (event, handler) => {
					if (event === "request") {
						requestInterceptors.add(handler as RequestInterceptorFN);
					}
					if (event === "response") {
						responseInterceptors.add(handler as ResponseInterceptorFN);
					}
				};
				return addInterceptorFN;
			}

			if (key === "removeInterceptor") {
				const removeEventListenerFN: InterceptionOperationFN = (
					eventName,
					handler,
				) => {
					if (eventName === "request") {
						requestInterceptors.delete(handler as RequestInterceptorFN);
					}
					if (eventName === "response") {
						responseInterceptors.delete(handler as ResponseInterceptorFN);
					}
				};

				return removeEventListenerFN;
			}

			return Reflect.get(target, key);
		},
	};
};

export const createKoolFetch = (
	options?: KoolFetchOptions,
): KoolFetchInstance => {
	const optionsWithDefaults = {
		fetch: globalThis.fetch,
		throwOnHttpError: true,
		httpErrorFactory: (response: Response) => new Error(response.statusText),
		...options,
	};

	return new Proxy(
		optionsWithDefaults.fetch as unknown as ExtendedFetch,
		createFetchProxyHandler(optionsWithDefaults),
	) as KoolFetchInstance;
};

export type * from "./types";
