export type KoolFetchOptions = {
	baseURL?: string | URL;
	fetch?: typeof fetch; // default globalThis.fetch
	init?: RequestInit;
	throwOnHttpError?: boolean; // default true
	httpErrorFactory?: (
		response: Response,
		requestOptions: Request,
	) => Error | Promise<Error>; // default throw new Error(response.statusText)
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

type UnwrapTargets = "json" | "arrayBuffer" | "blob" | "text";

export type ExtendedFetch = <
	ResponsePromise extends Promise<Response>,
	U extends UnwrapTargets,
>(
	...args: Parameters<typeof fetch>
) => ResponsePromise extends Promise<infer R>
	? R extends Response
		? ExtendedResponsePromise<R, U>
		: never
	: never;

export type ExtendedResponsePromise<
	R extends Response,
	U extends UnwrapTargets,
> = Promise<R> & {
	unwrap: <Unwrapped = ReturnType<R[U]>>(
		to: U,
	) => Unwrapped extends Promise<Unwrapped> ? Unwrapped : Promise<Unwrapped>;
};

export type KoolFetchInstance = ExtendedFetch & {
	addInterceptor: InterceptionOperationFN;
	removeInterceptor: InterceptionOperationFN;
};
