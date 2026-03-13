import type { tryCatch } from "./utils";

export type UnwrapTargets = "json" | "arrayBuffer" | "blob" | "text";

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

export type KoolFetchOptions = {
	baseURL?: string | URL;
	fetch?: typeof fetch;
	init?: RequestInit;
	throwOnHttpError?: boolean;
	httpErrorFactory?: (
		response: Response,
		request: Request,
	) => Error | Promise<Error>;
	retry?: RetryOption;
};

export type RequestInterceptorFN = (
	request: Request,
) => Promise<Request> | Request;

export type ResponseInterceptorFN = (
	response: Response,
	request: Request,
) => Promise<Response> | Response;

export type InterceptorHandler<T> = ((
	event: "request",
	fn: RequestInterceptorFN,
) => T) &
	((event: "response", fn: ResponseInterceptorFN) => T);

export type InterceptionOperationFN = InterceptorHandler<void>;

export type KoolFetchInstance = {
	(...args: Parameters<typeof fetch>): KoolFetchRequestBuilder;
	addInterceptor: InterceptionOperationFN;
	removeInterceptor: InterceptionOperationFN;
};

export type RetryConfig = {
	retries?: number;
	delay?: number | ((attempt: number, response: Response | null) => number);
	statusCodes?: number[];
	methods?: string[];
};

export type RetryOption = boolean | RetryConfig;

export type KoolFetchRequestInit = RequestInit & {
	retry?: RetryOption;
};

export type KoolFetchRequestBuilder = Promise<Response> & {
	addInterceptor: InterceptorHandler<KoolFetchRequestBuilder>;
	removeInterceptor: InterceptorHandler<KoolFetchRequestBuilder>;
	unwrap: ExtendedResponsePromise<Response, UnwrapTargets>["unwrap"];
	unwrapSafe: ExtendedResponsePromise<Response, UnwrapTargets>["unwrapSafe"];
};
