import { act, renderHook } from "@testing-library/react";
import {
    type CheckoutSessionLike,
    type CheckoutSessionStatus,
    type TransxactReactError,
    useCheckoutReturn,
} from "../index";

function session(status: CheckoutSessionStatus, extra: Record<string, unknown> = {}) {
    return { id: "cs_123", status, ...extra };
}

/** A Merchant retrieve function that answers with each status in turn, repeating the last one. */
function retrieveSequence(...statuses: CheckoutSessionStatus[]) {
    let call = 0;
    return vi.fn(async (_id: string, _context: { signal: AbortSignal }) => {
        const status = statuses[Math.min(call, statuses.length - 1)] as CheckoutSessionStatus;
        call += 1;
        return session(status);
    });
}

function landOnReturnPage(query: string) {
    window.history.replaceState(null, "", `/checkout/return${query}`);
}

async function flush() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    landOnReturnPage("?session_id=cs_123");
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useCheckoutReturn", () => {
    it("confirms a succeeded Checkout Session through the Merchant backend", async () => {
        const retrieveSession = retrieveSequence("succeeded");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();

        expect(retrieveSession).toHaveBeenCalledWith(
            "cs_123",
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("succeeded");
        expect(result.current.error).toBeUndefined();
    });

    it("is idle on first render, then loading while the Merchant backend answers", async () => {
        let answer: (value: CheckoutSessionLike) => void = () => {};
        const retrieveSession = vi.fn(() => new Promise<CheckoutSessionLike>((resolve) => (answer = resolve)));
        const states: string[] = [];
        const { result } = renderHook(() => {
            const value = useCheckoutReturn({ retrieveSession });
            states.push(value.state);
            return value;
        });
        expect(states[0]).toBe("idle");
        await flush();
        expect(result.current.state).toBe("loading");

        await act(async () => answer(session("cancelled")));
        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("cancelled");
    });

    it("is missing, and fetches nothing, when there is no session_id", async () => {
        landOnReturnPage("");
        const retrieveSession = retrieveSequence("succeeded");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();

        expect(result.current.state).toBe("missing");
        expect(retrieveSession).not.toHaveBeenCalled();
    });

    it("uses an explicit sessionId instead of the URL", async () => {
        landOnReturnPage("");
        const retrieveSession = retrieveSequence("failed");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession, sessionId: "cs_explicit" }));
        await flush();

        expect(retrieveSession).toHaveBeenCalledWith("cs_explicit", expect.anything());
        expect(result.current.session?.status).toBe("failed");
    });

    it("polls with capped exponential backoff while pending, then settles on the final status", async () => {
        const retrieveSession = retrieveSequence("pending", "pending", "pending", "pending", "succeeded");
        const { result } = renderHook(() =>
            useCheckoutReturn({
                retrieveSession,
                polling: { intervalMs: 1000, maxIntervalMs: 3000, timeoutMs: 60_000 },
            }),
        );
        await flush();
        expect(result.current.state).toBe("polling");
        expect(result.current.session?.status).toBe("pending");
        expect(retrieveSession).toHaveBeenCalledTimes(1);

        await advance(999);
        expect(retrieveSession).toHaveBeenCalledTimes(1);
        await advance(1); // 1000 ms
        expect(retrieveSession).toHaveBeenCalledTimes(2);
        await advance(2000); // doubled
        expect(retrieveSession).toHaveBeenCalledTimes(3);
        await advance(2999); // capped at 3000
        expect(retrieveSession).toHaveBeenCalledTimes(3);
        await advance(1);
        expect(retrieveSession).toHaveBeenCalledTimes(4);
        await advance(3000);
        expect(retrieveSession).toHaveBeenCalledTimes(5);

        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("succeeded");
        await advance(60_000);
        expect(retrieveSession).toHaveBeenCalledTimes(5);
    });

    it("uses 1.5 s, doubling to an 8 s cap, as default polling intervals", async () => {
        const retrieveSession = retrieveSequence("pending");
        renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();
        await advance(1500);
        expect(retrieveSession).toHaveBeenCalledTimes(2);
        await advance(3000);
        expect(retrieveSession).toHaveBeenCalledTimes(3);
        await advance(6000);
        expect(retrieveSession).toHaveBeenCalledTimes(4);
        await advance(8000);
        expect(retrieveSession).toHaveBeenCalledTimes(5);
    });

    it("times out after 60 s by default while the Checkout Session stays pending, then stops polling", async () => {
        const retrieveSession = retrieveSequence("pending");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();

        await advance(59_999);
        expect(result.current.state).toBe("polling");
        await advance(1);
        expect(result.current.state).toBe("timed_out");
        expect(result.current.session?.status).toBe("pending");

        const calls = retrieveSession.mock.calls.length;
        await advance(60_000);
        expect(retrieveSession).toHaveBeenCalledTimes(calls);
    });

    it("keeps the default for a polling field passed as undefined", async () => {
        const retrieveSession = retrieveSequence("pending");
        const { result } = renderHook(() =>
            useCheckoutReturn({ retrieveSession, polling: { intervalMs: undefined, timeoutMs: undefined } }),
        );
        await flush();
        await advance(1500);
        expect(retrieveSession).toHaveBeenCalledTimes(2);
        await advance(58_500);
        expect(result.current.state).toBe("timed_out");
    });

    it("honours a custom timeout", async () => {
        const retrieveSession = retrieveSequence("pending");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession, polling: { timeoutMs: 5000 } }));
        await flush();
        await advance(5000);
        expect(result.current.state).toBe("timed_out");
    });

    it("keeps a failed request apart from a failed payment", async () => {
        const broken = renderHook(() =>
            useCheckoutReturn({ retrieveSession: vi.fn().mockRejectedValue(new Error("Merchant backend down")) }),
        );
        const failedPayment = renderHook(() => useCheckoutReturn({ retrieveSession: retrieveSequence("failed") }));
        await flush();

        expect(broken.result.current.state).toBe("error");
        expect(broken.result.current.session).toBeUndefined();
        expect(broken.result.current.error?.message).toBe("Merchant backend down");

        expect(failedPayment.result.current.state).toBe("settled");
        expect(failedPayment.result.current.session?.status).toBe("failed");
        expect(failedPayment.result.current.error).toBeUndefined();
    });

    it.each([
        ["a non-object", "succeeded"],
        ["an unknown status", { id: "cs_123", status: "paid" }],
        ["no status", { id: "cs_123" }],
        ["null", null],
    ])("rejects %s with invalid_response", async (_label, response) => {
        const { result } = renderHook(() =>
            useCheckoutReturn({ retrieveSession: vi.fn().mockResolvedValue(response) }),
        );
        await flush();
        expect(result.current.state).toBe("error");
        expect((result.current.error as TransxactReactError).code).toBe("invalid_response");
    });

    it("fails with config_missing when there is no way to reach the Merchant backend", async () => {
        const { result } = renderHook(() => useCheckoutReturn());
        await flush();
        expect(result.current.state).toBe("error");
        expect((result.current.error as TransxactReactError).code).toBe("config_missing");
    });

    it("refresh restarts the lookup after an error", async () => {
        const retrieveSession = vi
            .fn()
            .mockRejectedValueOnce(new Error("flaky"))
            .mockResolvedValueOnce(session("succeeded"));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();
        expect(result.current.state).toBe("error");

        act(() => result.current.refresh());
        expect(result.current.state).toBe("loading");
        await flush();
        expect(result.current.state).toBe("settled");
        expect(result.current.error).toBeUndefined();
    });

    it("refresh restarts polling after a timeout", async () => {
        const retrieveSession = retrieveSequence("pending");
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession, polling: { timeoutMs: 3000 } }));
        await flush();
        await advance(3000);
        expect(result.current.state).toBe("timed_out");

        retrieveSession.mockResolvedValue(session("succeeded"));
        act(() => result.current.refresh());
        await flush();
        expect(result.current.state).toBe("settled");
    });

    it("refresh aborts the in-flight lookup and ignores its late response", async () => {
        const answers: Array<(value: CheckoutSessionLike) => void> = [];
        const signals: AbortSignal[] = [];
        const retrieveSession = vi.fn(
            (_id: string, { signal }: { signal: AbortSignal }) =>
                new Promise<CheckoutSessionLike>((resolve) => {
                    answers.push(resolve);
                    signals.push(signal);
                }),
        );
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();

        act(() => result.current.refresh());
        await flush();
        expect(signals[0]?.aborted).toBe(true);

        await act(async () => answers[0]?.(session("failed")));
        expect(result.current.state).toBe("loading");
        expect(result.current.session).toBeUndefined();

        await act(async () => answers[1]?.(session("succeeded")));
        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("succeeded");
    });

    it("aborts the in-flight request and stops polling on unmount", async () => {
        const retrieveSession = retrieveSequence("pending");
        const { unmount } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();
        const [, context] = retrieveSession.mock.calls[0] as [string, { signal: AbortSignal }];
        unmount();

        expect(context.signal.aborted).toBe(true);
        await advance(60_000);
        expect(retrieveSession).toHaveBeenCalledTimes(1);
    });

    it("drops a stale response when the session id changes", async () => {
        const answers: Record<string, (value: CheckoutSessionLike) => void> = {};
        const retrieveSession = vi.fn(
            (id: string) => new Promise<CheckoutSessionLike>((resolve) => (answers[id] = resolve)),
        );
        const { result, rerender } = renderHook(({ sessionId }) => useCheckoutReturn({ retrieveSession, sessionId }), {
            initialProps: { sessionId: "cs_old" },
        });
        await flush();
        rerender({ sessionId: "cs_new" });
        await flush();

        await act(async () => answers.cs_old?.({ id: "cs_old", status: "failed" }));
        expect(result.current.state).toBe("loading");
        await act(async () => answers.cs_new?.({ id: "cs_new", status: "succeeded" }));
        expect(result.current.session?.id).toBe("cs_new");
        expect(result.current.session?.status).toBe("succeeded");
    });

    it("returns the Merchant's own session type", async () => {
        const retrieveSession = vi.fn(async () => ({ id: "cs_123", status: "succeeded" as const, amount: 1500 }));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await flush();
        expect(result.current.session?.amount).toBe(1500);
    });
});
