import { TransxactReactError } from "./errors";

/** Extra fetch options for requests the URL shorthands send to the Merchant backend (e.g. a CSRF header). */
export type FetchInit = Omit<RequestInit, "body" | "method" | "signal">;

interface JsonRequest {
    method: "GET" | "POST";
    fetchInit: FetchInit | undefined;
    /** Headers the SDK owns; they always win over `fetchInit`. */
    headers?: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
}

/** Sends one request to the Merchant backend and returns its parsed JSON body. */
export async function requestJson(url: string, request: JsonRequest): Promise<unknown> {
    const headers = new Headers(request.fetchInit?.headers);
    for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value);

    const response = await fetch(url, {
        ...request.fetchInit,
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: request.signal,
    });
    const text = await response.text();
    let json: unknown;
    let isJson = false;
    try {
        json = JSON.parse(text);
        isJson = true;
    } catch {
        // Not JSON; decided below.
    }
    if (!response.ok) {
        throw new TransxactReactError(
            "http_error",
            `The Merchant backend answered ${request.method} ${url} with HTTP ${response.status}.`,
            { status: response.status, body: isJson ? json : text },
        );
    }
    if (!isJson) {
        throw new TransxactReactError("invalid_response", `The Merchant backend's response to ${url} is not JSON.`);
    }
    return json;
}
