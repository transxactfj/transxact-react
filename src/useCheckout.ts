import { useCallback, useEffect, useRef, useState } from "react";
import { type CreateSessionSettings, resolveCreateSession } from "./createSession";
import { TransxactReactError, toError } from "./errors";
import { validateHostedUrl } from "./hostedUrl";
import { newIdempotencyKey } from "./idempotencyKey";
import { useTransxactConfig } from "./TransxactProvider";

/** What `useCheckout` is doing right now. Never a statement about the payment. */
export type CheckoutState = "idle" | "creating" | "redirecting" | "error";

export interface UseCheckoutOptions extends CreateSessionSettings {
    /** Called with every error that moves `state` to `error`. */
    onError?: (error: Error) => void;
    /** Sends the Customer to the Checkout Session's hosted URL. Defaults to a full-page `location.assign`. */
    redirect?: (hostedUrl: string) => void;
}

export interface UseCheckoutResult {
    /** Starts a Checkout attempt, or retries the current one after an error. Ignored while one is under way. */
    start: () => Promise<void>;
    /** Abandons the Checkout attempt and returns to `idle`; the next `start` is a new Checkout attempt. */
    reset: () => void;
    state: CheckoutState;
    error: Error | undefined;
}

function assignLocation(hostedUrl: string): void {
    window.location.assign(hostedUrl);
}

/**
 * What a Checkout attempt asks for, as far as the SDK can see it. A retry that asks for something else (the
 * Customer changed the cart after an error) is a new Checkout attempt and must not reuse the Idempotency-Key.
 */
function attemptFingerprint(createSessionUrl: string | undefined, payload: unknown): string | null {
    try {
        return JSON.stringify([createSessionUrl ?? null, payload ?? null]);
    } catch {
        return null; // Not serialisable, so never provably the same attempt.
    }
}

export function useCheckout(options: UseCheckoutOptions = {}): UseCheckoutResult {
    const [state, setState] = useState<CheckoutState>("idle");
    const [error, setError] = useState<Error>();
    const config = useTransxactConfig();
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const configRef = useRef(config);
    configRef.current = config;
    // One Idempotency-Key per Checkout attempt: kept across retries, dropped by reset.
    const idempotencyKeyRef = useRef<string | null>(null);
    const fingerprintRef = useRef<string | null>(null);
    // Set synchronously so a second click in the same frame is ignored before state re-renders.
    const busyRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);

    const reset = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        idempotencyKeyRef.current = null;
        fingerprintRef.current = null;
        busyRef.current = false;
        setError(undefined);
        setState("idle");
    }, []);

    useEffect(() => {
        // A Customer who presses Back on the hosted URL may get this page from the back/forward cache,
        // frozen in `redirecting`; treat that as a fresh start.
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) reset();
        };
        window.addEventListener("pageshow", onPageShow);
        return () => {
            window.removeEventListener("pageshow", onPageShow);
            controllerRef.current?.abort();
        };
    }, [reset]);

    const start = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        const controller = new AbortController();
        controllerRef.current = controller;
        const { onError, redirect = assignLocation, payload } = optionsRef.current;
        const fingerprint = attemptFingerprint(
            optionsRef.current.createSessionUrl ?? configRef.current.createSessionUrl,
            payload,
        );
        if (idempotencyKeyRef.current === null || fingerprint === null || fingerprint !== fingerprintRef.current) {
            idempotencyKeyRef.current = newIdempotencyKey();
            fingerprintRef.current = fingerprint;
        }
        const idempotencyKey = idempotencyKeyRef.current;
        const createSession = resolveCreateSession(optionsRef.current, configRef.current);
        setError(undefined);
        setState("creating");
        try {
            if (!createSession) {
                throw new TransxactReactError(
                    "config_missing",
                    "No way to reach the Merchant backend: pass createSession or createSessionUrl, as a prop or on TransxactProvider.",
                );
            }
            const created = await createSession({ idempotencyKey, signal: controller.signal });
            if (controller.signal.aborted) return;
            const hostedUrl = validateHostedUrl(created?.hostedUrl);
            setState("redirecting");
            redirect(hostedUrl);
        } catch (caught) {
            if (controller.signal.aborted) return;
            const failure = toError(caught);
            busyRef.current = false;
            setError(failure);
            setState("error");
            onError?.(failure);
        }
    }, []);

    return { start, reset, state, error };
}
