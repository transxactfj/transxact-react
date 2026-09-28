/** The platform's status of a Checkout Session. "Status" never means anything else in this SDK. */
export type CheckoutSessionStatus = "pending" | "succeeded" | "failed" | "cancelled";

/**
 * The least a Merchant backend must return for a Checkout Session. `@transxact/node`'s `CheckoutSession`
 * satisfies it, so a Merchant backend can return that object unchanged.
 */
export interface CheckoutSessionLike {
    id: string;
    status: CheckoutSessionStatus;
}

/** What creating a Checkout Session must give the browser: where to send the Customer. */
export interface CreatedCheckoutSession {
    hostedUrl: string;
}

/** What the SDK hands a Merchant-supplied create function for one Checkout attempt. */
export interface CreateSessionContext {
    /** One per Checkout attempt, reused on retry. Forward it to Transxact as the `Idempotency-Key` header. */
    idempotencyKey: string;
    /** Aborted when the Checkout attempt is abandoned (unmount or `reset`). */
    signal: AbortSignal;
}

/** Asks the Merchant backend to create a Checkout Session. The Merchant backend decides the amount. */
export type CreateSession = (context: CreateSessionContext) => Promise<CreatedCheckoutSession>;

/** Asks the Merchant backend for a Checkout Session by id. */
export type RetrieveSession<S extends CheckoutSessionLike = CheckoutSessionLike> = (
    sessionId: string,
    context: { signal: AbortSignal },
) => Promise<S>;

/** How the Return page polls while a Checkout Session is `pending`. */
export interface PollingOptions {
    /** First wait between lookups. Default 1500 ms; doubles after each lookup. */
    intervalMs?: number;
    /** Longest wait between lookups. Default 8000 ms. */
    maxIntervalMs?: number;
    /** Give up (`timed_out`) this long after the first lookup. Default 60000 ms. */
    timeoutMs?: number;
}
