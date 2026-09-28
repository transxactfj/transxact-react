import { type FetchInit, requestJson } from "./http";
import type { TransxactConfig } from "./TransxactProvider";
import type { CheckoutSessionLike, RetrieveSession } from "./types";

/** A URL to GET a Checkout Session from: a fixed URL (the SDK adds `session_id`), or one built from the id. */
export type RetrieveSessionUrl = string | ((sessionId: string) => string);

export interface RetrieveSessionSettings<S extends CheckoutSessionLike = CheckoutSessionLike> {
    retrieveSession?: RetrieveSession<S>;
    retrieveSessionUrl?: RetrieveSessionUrl;
}

function urlFor(retrieveSessionUrl: RetrieveSessionUrl, sessionId: string): string {
    if (typeof retrieveSessionUrl === "function") return retrieveSessionUrl(sessionId);
    const url = new URL(retrieveSessionUrl, window.location.href);
    url.searchParams.set("session_id", sessionId);
    return url.href;
}

function fromUrl<S extends CheckoutSessionLike>(
    retrieveSessionUrl: RetrieveSessionUrl,
    fetchInit: FetchInit | undefined,
): RetrieveSession<S> {
    // The response is validated as a Checkout Session by the caller, whichever way it was retrieved.
    return async (sessionId, { signal }) =>
        (await requestJson(urlFor(retrieveSessionUrl, sessionId), { method: "GET", fetchInit, signal })) as S;
}

/**
 * Props beat the provider; at the same level a function beats a URL (so a prop URL beats a provider function).
 */
export function resolveRetrieveSession<S extends CheckoutSessionLike>(
    props: RetrieveSessionSettings<S>,
    config: TransxactConfig,
): RetrieveSession<S> | undefined {
    if (props.retrieveSession) return props.retrieveSession;
    if (props.retrieveSessionUrl) return fromUrl(props.retrieveSessionUrl, config.fetchInit);
    // The provider serves every Return page, so it can only promise the minimal shape.
    if (config.retrieveSession) return config.retrieveSession as RetrieveSession<S>;
    if (config.retrieveSessionUrl) return fromUrl(config.retrieveSessionUrl, config.fetchInit);
    return undefined;
}
