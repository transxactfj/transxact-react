import { type FetchInit, requestJson } from "./http";
import type { TransxactConfig } from "./TransxactProvider";
import type { CreatedCheckoutSession, CreateSession } from "./types";

export interface CreateSessionSettings {
    createSession?: CreateSession;
    createSessionUrl?: string;
    /** JSON sent by the URL shorthand. Identifies what is being bought; the Merchant backend decides the amount. */
    payload?: unknown;
}

function fromUrl(url: string, payload: unknown, fetchInit: FetchInit | undefined): CreateSession {
    return async ({ idempotencyKey, signal }) => {
        const body = await requestJson(url, {
            method: "POST",
            fetchInit,
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: payload ?? {},
            signal,
        });
        // hostedUrl itself is validated by the caller, whichever way the Checkout Session was created.
        return (typeof body === "object" && body !== null ? body : {}) as CreatedCheckoutSession;
    };
}

/**
 * Props beat the provider; at the same level a function beats a URL (so a prop URL beats a provider function).
 */
export function resolveCreateSession(props: CreateSessionSettings, config: TransxactConfig): CreateSession | undefined {
    if (props.createSession) return props.createSession;
    if (props.createSessionUrl) return fromUrl(props.createSessionUrl, props.payload, config.fetchInit);
    if (config.createSession) return config.createSession;
    if (config.createSessionUrl) return fromUrl(config.createSessionUrl, props.payload, config.fetchInit);
    return undefined;
}
