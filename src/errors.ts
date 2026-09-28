export type TransxactReactErrorCode = "config_missing" | "http_error" | "invalid_response" | "missing_session_id";

export interface TransxactReactErrorOptions {
    status?: number;
    body?: unknown;
    cause?: unknown;
}

/** An error raised by the SDK itself. Errors thrown by a Merchant-supplied function pass through unchanged. */
export class TransxactReactError extends Error {
    readonly code: TransxactReactErrorCode;
    /** HTTP status of the Merchant backend's response, for `http_error`. */
    readonly status?: number;
    /** Parsed body of the Merchant backend's response (raw text if it wasn't JSON), for `http_error`. */
    readonly body?: unknown;

    constructor(code: TransxactReactErrorCode, message: string, options: TransxactReactErrorOptions = {}) {
        super(message, { cause: options.cause });
        this.name = "TransxactReactError";
        this.code = code;
        this.status = options.status;
        this.body = options.body;
    }
}

export function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value), { cause: value });
}
