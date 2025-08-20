import type { tryCatch } from "./utils";

export type KoolFetchOptions = {
	baseURL?: string | URL;
	fetch?: typeof fetch; // default globalThis.fetch
	init?: RequestInit;
	throwOnHttpError?: boolean; // default true
	httpErrorFactory?: (
		response: Response,
		request: Request,
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

export type UnwrapTargets = "json" | "arrayBuffer" | "blob" | "text";

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
	unwrapSafe: <Unwrapped = ReturnType<R[U]>, Error = unknown>(
		to: U,
	) => ReturnType<
		typeof tryCatch<
			Unwrapped extends Promise<Unwrapped> ? Unwrapped : Promise<Unwrapped>,
			Error
		>
	>;
};

export type KoolFetchInstance = ExtendedFetch & {
	addInterceptor: InterceptionOperationFN;
	removeInterceptor: InterceptionOperationFN;
};
