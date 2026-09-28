import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { CheckoutButton, type CreateSessionContext, useCheckout } from "../index";

const HOSTED_URL = "https://transxact.io/c/cs_123";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A Merchant function that records each context and lets the test settle calls one at a time. */
function controllableCreateSession() {
    const contexts: CreateSessionContext[] = [];
    const settlers: Array<{ resolve: (v: { hostedUrl: string }) => void; reject: (e: unknown) => void }> = [];
    const createSession = vi.fn(
        (context: CreateSessionContext) =>
            new Promise<{ hostedUrl: string }>((resolve, reject) => {
                contexts.push(context);
                settlers.push({ resolve, reject });
            }),
    );
    return { createSession, contexts, settlers };
}

describe("Checkout attempt: Idempotency-Key", () => {
    it("hands the Merchant function a UUID Idempotency-Key and an abort signal", async () => {
        const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
        const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));

        await act(() => result.current.start());

        const [context] = createSession.mock.calls[0] as [CreateSessionContext];
        expect(context.idempotencyKey).toMatch(UUID);
        expect(context.signal).toBeInstanceOf(AbortSignal);
    });

    it("reuses the same Idempotency-Key when the Customer retries after an error", async () => {
        const createSession = vi
            .fn()
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce({ hostedUrl: HOSTED_URL });
        const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));

        await act(() => result.current.start());
        expect(result.current.state).toBe("error");
        await act(() => result.current.start());

        const keys = createSession.mock.calls.map(([context]) => (context as CreateSessionContext).idempotencyKey);
        expect(keys[0]).toBe(keys[1]);
    });

    it("uses a new Idempotency-Key after reset", async () => {
        const createSession = vi.fn().mockRejectedValue(new Error("network"));
        const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));

        await act(() => result.current.start());
        act(() => result.current.reset());
        await act(() => result.current.start());

        const keys = createSession.mock.calls.map(([context]) => (context as CreateSessionContext).idempotencyKey);
        expect(keys[0]).not.toBe(keys[1]);
    });

    it("uses a new Idempotency-Key after the component remounts", async () => {
        const createSession = vi.fn().mockRejectedValue(new Error("network"));
        const first = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));
        await act(() => first.result.current.start());
        first.unmount();

        const second = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));
        await act(() => second.result.current.start());

        const keys = createSession.mock.calls.map(([context]) => (context as CreateSessionContext).idempotencyKey);
        expect(keys[0]).not.toBe(keys[1]);
    });

    it("falls back to crypto.getRandomValues when crypto.randomUUID is unavailable", async () => {
        const real = globalThis.crypto;
        vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
        try {
            const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
            const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));
            await act(() => result.current.start());
            const [context] = createSession.mock.calls[0] as [CreateSessionContext];
            expect(context.idempotencyKey).toMatch(UUID);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("Checkout attempt: double-submit guard", () => {
    it("ignores start while a Checkout attempt is being created", async () => {
        const { createSession, settlers } = controllableCreateSession();
        const redirect = vi.fn();
        const { result } = renderHook(() => useCheckout({ createSession, redirect }));

        await act(async () => {
            void result.current.start();
            void result.current.start();
        });
        expect(createSession).toHaveBeenCalledTimes(1);

        await act(async () => settlers[0]?.resolve({ hostedUrl: HOSTED_URL }));
        await act(() => result.current.start());
        expect(createSession).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledTimes(1);
    });

    it("calls the Merchant function once for two rapid clicks", async () => {
        const { createSession } = controllableCreateSession();
        render(
            <CheckoutButton createSession={createSession} redirect={vi.fn()}>
                Pay
            </CheckoutButton>,
        );
        const button = screen.getByRole("button", { name: "Pay" });
        await act(async () => {
            fireEvent.click(button);
            fireEvent.click(button);
        });
        expect(createSession).toHaveBeenCalledTimes(1);
    });
});

describe("Checkout attempt: abort", () => {
    it("aborts the Merchant function's signal on unmount and never redirects", async () => {
        const { createSession, contexts, settlers } = controllableCreateSession();
        const redirect = vi.fn();
        const { result, unmount } = renderHook(() => useCheckout({ createSession, redirect }));

        await act(async () => void result.current.start());
        unmount();

        expect(contexts[0]?.signal.aborted).toBe(true);
        await act(async () => settlers[0]?.resolve({ hostedUrl: HOSTED_URL }));
        expect(redirect).not.toHaveBeenCalled();
    });

    it("aborts on reset and ignores the abandoned attempt's result", async () => {
        const { createSession, contexts, settlers } = controllableCreateSession();
        const redirect = vi.fn();
        const onError = vi.fn();
        const { result } = renderHook(() => useCheckout({ createSession, redirect, onError }));

        await act(async () => void result.current.start());
        act(() => result.current.reset());
        expect(contexts[0]?.signal.aborted).toBe(true);

        await act(async () => settlers[0]?.reject(new DOMException("aborted", "AbortError")));
        expect(result.current.state).toBe("idle");
        expect(onError).not.toHaveBeenCalled();
        expect(redirect).not.toHaveBeenCalled();
    });
});

describe("Checkout attempt: back/forward cache", () => {
    it("returns to idle with a fresh Idempotency-Key when the page is restored from the back/forward cache", async () => {
        const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
        const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));
        await act(() => result.current.start());
        expect(result.current.state).toBe("redirecting");

        act(() => {
            const restored = new Event("pageshow") as PageTransitionEvent;
            Object.defineProperty(restored, "persisted", { value: true });
            window.dispatchEvent(restored);
        });
        expect(result.current.state).toBe("idle");

        await act(() => result.current.start());
        const keys = createSession.mock.calls.map(([context]) => (context as CreateSessionContext).idempotencyKey);
        expect(keys).toHaveLength(2);
        expect(keys[0]).not.toBe(keys[1]);
    });

    it("ignores a normal pageshow", async () => {
        const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
        const { result } = renderHook(() => useCheckout({ createSession, redirect: vi.fn() }));
        await act(() => result.current.start());
        act(() => {
            window.dispatchEvent(new Event("pageshow"));
        });
        expect(result.current.state).toBe("redirecting");
    });
});

describe("CheckoutButton during a Checkout attempt", () => {
    it("runs the Merchant's onClick first and does not start when it calls preventDefault", async () => {
        const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
        render(
            <CheckoutButton createSession={createSession} redirect={vi.fn()} onClick={(e) => e.preventDefault()}>
                Pay
            </CheckoutButton>,
        );
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pay" })));
        expect(createSession).not.toHaveBeenCalled();
    });

    it("runs the Merchant's onClick before asking the Merchant backend", async () => {
        const order: string[] = [];
        const createSession = vi.fn(async () => {
            order.push("createSession");
            return { hostedUrl: HOSTED_URL };
        });
        render(
            <CheckoutButton createSession={createSession} redirect={vi.fn()} onClick={() => order.push("onClick")}>
                Pay
            </CheckoutButton>,
        );
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pay" })));
        expect(order).toEqual(["onClick", "createSession"]);
    });

    it("is disabled and aria-busy while creating and redirecting", async () => {
        const { createSession, settlers } = controllableCreateSession();
        render(
            <CheckoutButton createSession={createSession} redirect={vi.fn()}>
                Pay
            </CheckoutButton>,
        );
        const button = screen.getByRole("button", { name: "Pay" }) as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        expect(button.getAttribute("aria-busy")).toBeNull();

        await act(async () => fireEvent.click(button));
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");

        await act(async () => settlers[0]?.resolve({ hostedUrl: HOSTED_URL }));
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
    });

    it("is enabled again after an error", async () => {
        render(
            <CheckoutButton createSession={vi.fn().mockRejectedValue(new Error("x"))} redirect={vi.fn()}>
                Pay
            </CheckoutButton>,
        );
        const button = screen.getByRole("button", { name: "Pay" }) as HTMLButtonElement;
        await act(async () => fireEvent.click(button));
        expect(button.disabled).toBe(false);
    });

    it("still honours a Merchant-supplied disabled", () => {
        render(
            <CheckoutButton createSession={vi.fn()} disabled>
                Pay
            </CheckoutButton>,
        );
        expect((screen.getByRole("button", { name: "Pay" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
