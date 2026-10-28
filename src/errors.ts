export type TransxactReactErrorCode = "config_missing" | "http_error" | "invalid_response" | "timeout";

export interface TransxactReactErrorOptions {
    status?: number;
    body?: unknown;
    cause?: unknown;
    apiCode?: string;
}

/** An error raised by the SDK itself. Errors thrown by a Merchant-supplied function pass through unchanged. */
export class TransxactReactError extends Error {
    readonly code: TransxactReactErrorCode;
    /** HTTP status of the Merchant backend's response, for `http_error`. */
    readonly status?: number;
    /**
     * Parsed body of the Merchant backend's response (raw text if it wasn't JSON), for `http_error`.
     * It comes from the Merchant backend and may be sensitive: don't show it to the Customer.
     */
    readonly body?: unknown;
    /** The `error.code` of an `{ error: { code } }` body, e.g. `idempotency_key_reused`, for `http_error`. */
    readonly apiCode?: string;

    constructor(code: TransxactReactErrorCode, message: string, options: TransxactReactErrorOptions = {}) {
        super(message, { cause: options.cause });
        this.name = "TransxactReactError";
        this.code = code;
        this.status = options.status;
        this.body = options.body;
        this.apiCode = options.apiCode;
    }
}

export function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value), { cause: value });
}

/** The `error.code` string of a `{ error: { code } }` response body, if it has one. */
export function apiErrorCode(body: unknown): string | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const error = (body as { error?: unknown }).error;
    if (typeof error !== "object" || error === null) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}
