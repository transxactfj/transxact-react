import { TransxactReactError } from "./errors";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Only an https URL (or http on a loopback host, for local development) may receive the Customer, so a
 * compromised or misconfigured Merchant backend can't turn the pay button into an open redirect.
 */
export function validateHostedUrl(value: unknown, allowedHosts?: readonly string[]): string {
    if (typeof value !== "string") {
        throw new TransxactReactError("invalid_response", "The Merchant backend's response has no hostedUrl string.");
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch (cause) {
        throw new TransxactReactError("invalid_response", `hostedUrl is not a valid URL: ${value}`, { cause });
    }
    const allowed =
        url.protocol === "https:" ||
        (url.protocol === "http:" && (LOOPBACK_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost")));
    if (!allowed) {
        throw new TransxactReactError("invalid_response", `hostedUrl must be an https URL: ${value}`);
    }
    if (allowedHosts && !allowedHosts.includes(url.hostname)) {
        throw new TransxactReactError("invalid_response", `hostedUrl host is not allowed: ${url.hostname}`);
    }
    return url.href;
}
