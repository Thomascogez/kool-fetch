export type CoolFetchOptions = {
	baseURL?: string | URL;
	fetch?: typeof fetch; // default globalThis.fetch
	init?: RequestInit;
	throwOnHttpError?: boolean; // default true
	httpErrorFactory?: (
		response: Response,
		requestOptions: { url: string; init: RequestInit },
	) => Error; // default throw new Error(response.statusText)
};

export type RequestInterceptorFN = (
	request: Request,
) => Promise<Request> | Request;

export type ResponseInterceptorFN = (
	response: Response,
	request: Request,
) => Promise<Response> | Response;

export type InterceptionOperationFN = ((
	event: "request",
	fn: RequestInterceptorFN,
) => void) &
	((event: "response", fn: ResponseInterceptorFN) => void);

export type CoolFetchInstance = typeof globalThis.fetch & {
	addInterceptor: InterceptionOperationFN;
	removeInterceptor: InterceptionOperationFN;
};
