import { apiErrorCode, TransxactReactError } from "./errors";

/** Extra fetch options for requests the URL shorthands send to the Merchant backend (e.g. a CSRF header). */
export type FetchInit = Omit<RequestInit, "body" | "method" | "signal">;

/** How long a request to the Merchant backend may take before it fails with `timeout`. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface JsonRequest {
    method: "GET" | "POST";
    fetchInit: FetchInit | undefined;
    /** Headers the SDK owns; they always win over `fetchInit`. */
    headers?: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
    /** Default 30000 ms. */
    timeoutMs?: number;
}

/** The path of a URL, so errors never carry query strings, credentials or hosts the Merchant didn't expect. */
function describe(url: string): string {
    try {
        return new URL(url, "http://localhost").pathname;
    } catch {
        return "the Merchant backend";
    }
}

/** Sends one request to the Merchant backend and returns its parsed JSON body. */
export async function requestJson(url: string, request: JsonRequest): Promise<unknown> {
    const headers = new Headers(request.fetchInit?.headers);
    for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value);

    const timeoutMs = request.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", onAbort, { once: true });

    let text: string;
    let status: number;
    let ok: boolean;
    try {
        const response = await fetch(url, {
            ...request.fetchInit,
            method: request.method,
            headers,
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
            signal: controller.signal,
        });
        status = response.status;
        ok = response.ok;
        text = await response.text();
    } catch (caught) {
        if (timedOut && !request.signal.aborted) {
            throw new TransxactReactError(
                "timeout",
                `The Merchant backend did not answer ${request.method} ${describe(url)} within ${timeoutMs} ms.`,
                { cause: caught },
            );
        }
        throw caught;
    } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onAbort);
    }

    let json: unknown;
    let isJson = false;
    try {
        json = JSON.parse(text);
        isJson = true;
    } catch {
        // Not JSON; decided below.
    }
    if (!ok) {
        throw new TransxactReactError(
            "http_error",
            `The Merchant backend answered ${request.method} ${describe(url)} with HTTP ${status}.`,
            { status, body: isJson ? json : text, apiCode: isJson ? apiErrorCode(json) : undefined },
        );
    }
    if (!isJson) {
        throw new TransxactReactError(
            "invalid_response",
            `The Merchant backend's response to ${request.method} ${describe(url)} is not JSON.`,
        );
    }
    return json;
}
