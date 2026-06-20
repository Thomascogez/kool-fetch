export type UnwrapTargets = "json" | "arrayBuffer" | "blob" | "text";

// Maps each unwrap target to its resolved (awaited) return type.
// Uses non-distributive conditional ([T] extends [...]) so that a specific
// target like "arrayBuffer" resolves to ArrayBuffer, while the full union
// falls back to unknown (the safe default).
type ResolvedUnwrap<R extends Response, T extends UnwrapTargets> = [T] extends [
	"json",
]
	? Awaited<ReturnType<R["json"]>>
	: [T] extends ["arrayBuffer"]
		? Awaited<ReturnType<R["arrayBuffer"]>>
		: [T] extends ["text"]
			? Awaited<ReturnType<R["text"]>>
			: [T] extends ["blob"]
				? Awaited<ReturnType<R["blob"]>>
				: unknown;

export type ExtendedResponsePromise<
	R extends Response,
	U extends UnwrapTargets,
> = Promise<R> & {
	// Unwrapped is first so users can write unwrap<{id: number}>("json").
	// T is inferred from the `to` argument, narrowing the return type.
	// undefined sentinel detects whether the user supplied Unwrapped.
	unwrap: <Unwrapped = undefined, T extends U = U>(
		to: T,
	) => Promise<
		[Unwrapped] extends [undefined] ? ResolvedUnwrap<R, T> : Unwrapped
	>;
	unwrapSafe: <Unwrapped = undefined, Error = unknown, T extends U = U>(
		to: T,
	) => Promise<
		| [
				[Unwrapped] extends [undefined] ? ResolvedUnwrap<R, T> : Unwrapped,
				undefined,
		  ]
		| [undefined, Error]
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
