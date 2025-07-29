import type {
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

const createProxyHandler = (
	options: KoolFetchOptions,
): ProxyHandler<KoolFetchInstance> => {
	const requestInterceptors = new Set<RequestInterceptorFN>();
	const responseInterceptors = new Set<ResponseInterceptorFN>();
	return {
		apply: async (target, thisArg, argArray) => {
			const [pathName, init] = argArray;
			const {
				baseURL,
				init: fetchInit,
				throwOnHttpError,
				httpErrorFactory,
			} = options;

			const endpointURL = buildRequestURL(baseURL ?? "", pathName);
			const requestInit = mergeRequestInit(fetchInit ?? {}, init ?? {});

			const request = new Request(endpointURL.toString(), requestInit);
			const interceptedRequest = await applyRequestInterceptors(
				request,
				requestInterceptors,
			);

			const response = await target.apply(thisArg, [interceptedRequest]);
			const interceptedResponse = await applyResponseInterceptors(
				response,
				request,
				responseInterceptors,
			);

			if (throwOnHttpError && !interceptedResponse.ok) {
				const error = await httpErrorFactory?.(interceptedResponse, {
					url: endpointURL.toString(),
					init: requestInit,
				});

				throw error;
			}

			return interceptedResponse;
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
		optionsWithDefaults.fetch,
		createProxyHandler(optionsWithDefaults),
	) as KoolFetchInstance;
};
