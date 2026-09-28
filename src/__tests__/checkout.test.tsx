import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createRef } from "react";
import { CheckoutButton, TransxactReactError, useCheckout } from "../index";

const HOSTED_URL = "https://transxact.io/c/cs_123";

function created(...args: [hostedUrl?: unknown]) {
    return vi.fn().mockResolvedValue({ hostedUrl: args.length > 0 ? args[0] : HOSTED_URL });
}

async function clickPay() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    });
}

describe("CheckoutButton", () => {
    it("asks the Merchant backend for a Checkout Session and redirects the Customer to its hosted URL", async () => {
        const createSession = created();
        const redirect = vi.fn();

        render(
            <CheckoutButton createSession={createSession} redirect={redirect}>
                Pay
            </CheckoutButton>,
        );
        await clickPay();

        expect(createSession).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith(HOSTED_URL);
    });

    it("renders an unstyled button that defaults to type=button so it never submits a surrounding form", () => {
        render(<CheckoutButton createSession={created()}>Pay</CheckoutButton>);
        const button = screen.getByRole("button", { name: "Pay" });
        expect(button.getAttribute("type")).toBe("button");
        expect(button.getAttribute("class")).toBeNull();
        expect(button.getAttribute("style")).toBeNull();
    });

    it("forwards standard button props and a ref", () => {
        const ref = createRef<HTMLButtonElement>();
        render(
            <CheckoutButton
                ref={ref}
                createSession={created()}
                className="btn"
                aria-label="Pay"
                data-testid="pay"
                type="submit"
            >
                Pay now
            </CheckoutButton>,
        );
        const button = screen.getByTestId("pay");
        expect(ref.current).toBe(button);
        expect(button.className).toBe("btn");
        expect(button.getAttribute("aria-label")).toBe("Pay");
        expect(button.getAttribute("type")).toBe("submit");
    });

    it("sends the Customer with a full-page navigation when no redirect is given", async () => {
        const assign = vi.fn();
        vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign });
        render(<CheckoutButton createSession={created()}>Pay</CheckoutButton>);

        await clickPay();

        expect(assign).toHaveBeenCalledWith(HOSTED_URL);
        vi.restoreAllMocks();
    });
});

describe("useCheckout", () => {
    it("moves state idle → creating → redirecting on success", async () => {
        let finish: (value: { hostedUrl: string }) => void = () => {};
        const createSession = vi.fn(() => new Promise<{ hostedUrl: string }>((resolve) => (finish = resolve)));
        const redirect = vi.fn();
        const { result } = renderHook(() => useCheckout({ createSession, redirect }));
        expect(result.current.state).toBe("idle");

        let started: Promise<void> = Promise.resolve();
        act(() => {
            started = result.current.start();
        });
        expect(result.current.state).toBe("creating");

        await act(async () => {
            finish({ hostedUrl: HOSTED_URL });
            await started;
        });
        expect(result.current.state).toBe("redirecting");
        expect(result.current.error).toBeUndefined();
    });

    it("passes a Merchant function's error through unchanged, sets state error and calls onError", async () => {
        const failure = new Error("Out of stock");
        const onError = vi.fn();
        const redirect = vi.fn();
        const { result } = renderHook(() =>
            useCheckout({ createSession: vi.fn().mockRejectedValue(failure), onError, redirect }),
        );

        await act(() => result.current.start());

        expect(result.current.state).toBe("error");
        expect(result.current.error).toBe(failure);
        expect(onError).toHaveBeenCalledWith(failure);
        expect(redirect).not.toHaveBeenCalled();
    });

    it("wraps a non-Error thrown by the Merchant function in an Error", async () => {
        const { result } = renderHook(() =>
            useCheckout({ createSession: vi.fn().mockRejectedValue("nope"), redirect: vi.fn() }),
        );
        await act(() => result.current.start());
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toBe("nope");
    });

    it("reset returns to idle and clears the error", async () => {
        const { result } = renderHook(() =>
            useCheckout({ createSession: vi.fn().mockRejectedValue(new Error("x")), redirect: vi.fn() }),
        );
        await act(() => result.current.start());
        act(() => result.current.reset());
        expect(result.current.state).toBe("idle");
        expect(result.current.error).toBeUndefined();
    });

    it("fails with config_missing when there is no way to reach the Merchant backend", async () => {
        const { result } = renderHook(() => useCheckout({ redirect: vi.fn() }));
        await act(() => result.current.start());
        expect(result.current.state).toBe("error");
        expect(result.current.error).toBeInstanceOf(TransxactReactError);
        expect((result.current.error as TransxactReactError).code).toBe("config_missing");
    });

    describe("hosted URL validation", () => {
        it.each([
            ["an http URL on a public host", "http://transxact.io/c/cs_123"],
            ["a javascript: URL", "javascript:alert(1)"],
            ["a relative path", "/c/cs_123"],
            ["a missing hostedUrl", undefined],
            ["a non-string hostedUrl", 42],
        ])("refuses %s with invalid_response and never redirects", async (_label, hostedUrl) => {
            const redirect = vi.fn();
            const { result } = renderHook(() => useCheckout({ createSession: created(hostedUrl), redirect }));

            await act(() => result.current.start());

            expect(redirect).not.toHaveBeenCalled();
            expect(result.current.state).toBe("error");
            expect((result.current.error as TransxactReactError).code).toBe("invalid_response");
        });

        it.each(["http://localhost:3000/c/cs_1", "http://127.0.0.1:8787/c/cs_1"])(
            "allows http on a loopback host (%s)",
            async (hostedUrl) => {
                const redirect = vi.fn();
                const { result } = renderHook(() => useCheckout({ createSession: created(hostedUrl), redirect }));
                await act(() => result.current.start());
                expect(redirect).toHaveBeenCalledWith(hostedUrl);
            },
        );
    });
});
