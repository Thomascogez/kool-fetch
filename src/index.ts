import type {
	InterceptionOperationFN,
	KoolFetchInstance,
	KoolFetchOptions,
	KoolFetchRequestBuilder,
	KoolFetchRequestInit,
	RequestInterceptorFN,
	ResponseInterceptorFN,
	RetryConfig,
	RetryOption,
	UnwrapTargets,
} from "./types.js";
import { buildRequestURL, mergeRequestInit, tryCatch } from "./utils.js";

const DEFAULT_RETRY_METHODS = ["GET", "HEAD", "OPTIONS"];
const DEFAULT_RETRY_STATUS_CODES = [500, 502, 503, 504];
const DEFAULT_RETRIES = 3;

const applyRequestInterceptors = async (
	request: Request,
	requestInterceptors: Set<RequestInterceptorFN>,
) => {
	let interceptedRequest = request;

	for (const requestInterceptor of requestInterceptors) {
		interceptedRequest = await requestInterceptor(interceptedRequest);
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

const normalizeRetryOption = (
	retry: RetryOption | undefined,
): RetryConfig | undefined => {
	if (retry === false || retry === undefined) {
		return undefined;
	}
	if (retry === true) {
		return {};
	}
	return retry;
};

const mergeRetryConfig = (
	globalRetry: RetryOption | undefined,
	perRequestRetry: RetryOption | undefined,
): RetryConfig | undefined => {
	if (perRequestRetry === false) {
		return undefined;
	}

	const normalizedGlobal = normalizeRetryOption(globalRetry);
	const normalizedPerRequest = normalizeRetryOption(perRequestRetry);

	if (!normalizedGlobal && !normalizedPerRequest) {
		return undefined;
	}

	if (globalRetry === false && !normalizedPerRequest) {
		return undefined;
	}

	return {
		retries:
			normalizedPerRequest?.retries ??
			normalizedGlobal?.retries ??
			DEFAULT_RETRIES,
		delay: normalizedPerRequest?.delay ?? normalizedGlobal?.delay,
		statusCodes:
			normalizedPerRequest?.statusCodes ??
			normalizedGlobal?.statusCodes ??
			DEFAULT_RETRY_STATUS_CODES,
		methods:
			normalizedPerRequest?.methods ??
			normalizedGlobal?.methods ??
			DEFAULT_RETRY_METHODS,
	};
};

const shouldRetry = (
	response: Response,
	request: Request,
	retryConfig: RetryConfig,
): boolean => {
	const method = request.method.toUpperCase();

	if (!retryConfig.methods?.includes(method)) {
		return false;
	}

	return retryConfig.statusCodes?.includes(response.status) ?? false;
};

class RequestBuilder {
	private url: string;
	private init: RequestInit;
	private requestInterceptors: Set<RequestInterceptorFN> = new Set();
	private responseInterceptors: Set<ResponseInterceptorFN> = new Set();
	private globalRequestInterceptors: Set<RequestInterceptorFN>;
	private globalResponseInterceptors: Set<ResponseInterceptorFN>;
	private fetchFn: typeof globalThis.fetch;
	private baseURL: string;
	private options: KoolFetchOptions;
	private retryConfig: RetryConfig | undefined;
	// Lazily initialized shared promise — prevents multiple fetches if
	// .then(), .catch(), and .finally() are all called on the same builder.
	private _promise: Promise<Response> | null = null;

	constructor(
		url: string,
		init: RequestInit,
		globalRequestInterceptors: Set<RequestInterceptorFN>,
		globalResponseInterceptors: Set<ResponseInterceptorFN>,
		fetchFn: typeof globalThis.fetch,
		baseURL: string,
		options: KoolFetchOptions,
		retryConfig: RetryConfig | undefined,
	) {
		this.url = url;
		this.init = init;
		this.globalRequestInterceptors = globalRequestInterceptors;
		this.globalResponseInterceptors = globalResponseInterceptors;
		this.fetchFn = fetchFn;
		this.baseURL = baseURL;
		this.options = options;
		this.retryConfig = retryConfig;
	}

	addInterceptor(
		event: "request",
		handler: RequestInterceptorFN,
	): RequestBuilder;
	addInterceptor(
		event: "response",
		handler: ResponseInterceptorFN,
	): RequestBuilder;
	addInterceptor(
		event: "request" | "response",
		handler: RequestInterceptorFN | ResponseInterceptorFN,
	): RequestBuilder {
		if (event === "request") {
			this.requestInterceptors.add(handler as RequestInterceptorFN);
		} else {
			this.responseInterceptors.add(handler as ResponseInterceptorFN);
		}
		return this;
	}

	removeInterceptor(
		event: "request",
		handler: RequestInterceptorFN,
	): RequestBuilder;
	removeInterceptor(
		event: "response",
		handler: ResponseInterceptorFN,
	): RequestBuilder;
	removeInterceptor(
		event: "request" | "response",
		handler: RequestInterceptorFN | ResponseInterceptorFN,
	): RequestBuilder {
		if (event === "request") {
			this.requestInterceptors.delete(handler as RequestInterceptorFN);
		} else {
			this.responseInterceptors.delete(handler as ResponseInterceptorFN);
		}
		return this;
	}

	unwrap<T extends UnwrapTargets>(target: T) {
		return this.then((response) => response[target]());
	}

	unwrapSafe<T extends UnwrapTargets>(target: T) {
		return tryCatch(this.unwrap(target));
	}

	// Arrow function ensures `this` is always bound correctly when the runtime
	// invokes execute() through the thenable protocol (e.g. in CF Workers).
	private execute = async (): Promise<Response> => {
		const endpointURL = buildRequestURL(this.baseURL, this.url);
		const requestInit = mergeRequestInit(this.options.init ?? {}, this.init);
		const request = new Request(endpointURL.toString(), requestInit);

		const allRequestInterceptors = new Set([
			...this.globalRequestInterceptors,
			...this.requestInterceptors,
		]);

		const interceptedRequest = await applyRequestInterceptors(
			request,
			allRequestInterceptors,
		);

		const allResponseInterceptors = new Set([
			...this.globalResponseInterceptors,
			...this.responseInterceptors,
		]);

		if (this.retryConfig) {
			const retryConfig = this.retryConfig;

			const executeWithRetry = async (
				attempt: number,
				lastResponse: Response | null,
			): Promise<Response> => {
				const { retries = DEFAULT_RETRIES, delay } = retryConfig;

				if (attempt > 0 && delay) {
					const currentDelay =
						typeof delay === "function" ? delay(attempt, lastResponse) : delay;

					if (currentDelay > 0) {
						await new Promise((resolve) => setTimeout(resolve, currentDelay));
					}
				}

				const response = await this.fetchFn(interceptedRequest);

				if (!shouldRetry(response, interceptedRequest, retryConfig)) {
					return processResponse(
						interceptedRequest,
						response,
						allResponseInterceptors,
						this.options,
					);
				}

				if (attempt >= retries) {
					throw new Error(`Retry failed with status: ${response.status}`);
				}

				return executeWithRetry(attempt + 1, response);
			};

			return executeWithRetry(0, null);
		}

		const response = await this.fetchFn(interceptedRequest);

		return processResponse(
			interceptedRequest,
			response,
			allResponseInterceptors,
			this.options,
		);
	};

	// Returns a single shared promise so that chaining .then()/.catch()/.finally()
	// on the same builder instance does not trigger multiple fetches.
	private getPromise(): Promise<Response> {
		if (!this._promise) {
			this._promise = this.execute();
		}
		return this._promise;
	}

	// biome-ignore lint/suspicious/noThenProperty: thenable class required for API compatibility
	then<TResult1 = Response, TResult2 = never>(
		onfulfilled?:
			| ((value: Response) => TResult1 | PromiseLike<TResult1>)
			| undefined,
		onrejected?:
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| undefined,
	): Promise<TResult1 | TResult2> {
		return this.getPromise().then(onfulfilled, onrejected);
	}

	catch<TResult = never>(
		onrejected?:
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| undefined,
	): Promise<Response | TResult> {
		return this.getPromise().catch(onrejected);
	}

	finally(onfinally?: (() => void) | undefined): Promise<Response> {
		return this.getPromise().finally(onfinally);
	}
}

export const createKoolFetch = (
	options?: KoolFetchOptions,
): KoolFetchInstance => {
	const optionsWithDefaults = {
		fetch: globalThis.fetch,
		throwOnHttpError: true,
		httpErrorFactory: (response: Response) => new Error(response.statusText),
		...options,
	};

	const requestInterceptors = new Set<RequestInterceptorFN>();
	const responseInterceptors = new Set<ResponseInterceptorFN>();

	const fetchFn = (
		...args: Parameters<typeof fetch>
	): KoolFetchRequestBuilder => {
		const [pathName, init] = args;
		const {
			baseURL,
			fetch: fetchImpl,
			init: fetchInit,
			retry: globalRetry,
		} = optionsWithDefaults;

		const perRequestInit = init as KoolFetchRequestInit;
		const perRequestRetry = perRequestInit?.retry;
		const retryConfig = mergeRetryConfig(globalRetry, perRequestRetry);

		const normalizedBaseURL = baseURL ?? "";
		const requestUrl =
			typeof pathName === "string"
				? pathName
				: pathName instanceof URL
					? pathName.toString()
					: pathName.url;

		const url = buildRequestURL(
			normalizedBaseURL instanceof URL
				? normalizedBaseURL.toString()
				: normalizedBaseURL,
			requestUrl,
		);
		const requestInit = mergeRequestInit(fetchInit ?? {}, init ?? {});

		const builder = new RequestBuilder(
			url.toString(),
			requestInit,
			requestInterceptors,
			responseInterceptors,
			fetchImpl ?? globalThis.fetch,
			normalizedBaseURL instanceof URL
				? normalizedBaseURL.toString()
				: normalizedBaseURL,
			optionsWithDefaults,
			retryConfig,
		);

		return builder as unknown as KoolFetchRequestBuilder;
	};

	const addInterceptor: InterceptionOperationFN = (event, handler) => {
		if (event === "request") {
			requestInterceptors.add(handler as RequestInterceptorFN);
		} else {
			responseInterceptors.add(handler as ResponseInterceptorFN);
		}
	};

	const removeInterceptor: InterceptionOperationFN = (event, handler) => {
		if (event === "request") {
			requestInterceptors.delete(handler as RequestInterceptorFN);
		} else {
			responseInterceptors.delete(handler as ResponseInterceptorFN);
		}
	};

	const koolFetchInstance: KoolFetchInstance = Object.assign(fetchFn, {
		addInterceptor,
		removeInterceptor,
	});

	return koolFetchInstance;
};

export type * from "./types";
