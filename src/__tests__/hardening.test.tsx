import { act, renderHook } from "@testing-library/react";
import { validateHostedUrl } from "../hostedUrl";
import { requestJson } from "../http";
import { TransxactReactError, useCheckoutReturn } from "../index";

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/checkout/return?session_id=cs_123");
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("requestJson", () => {
    it("fails with `timeout` when the Merchant backend never answers", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                    }),
            ),
        );
        const pending = requestJson("/api/checkout?token=secret", {
            method: "GET",
            fetchInit: undefined,
            signal: new AbortController().signal,
            timeoutMs: 1000,
        }).catch((error: unknown) => error);
        await advance(1000);

        const error = (await pending) as TransxactReactError;
        expect(error).toBeInstanceOf(TransxactReactError);
        expect(error.code).toBe("timeout");
        expect(error.message).not.toContain("secret");
    });

    it("rethrows the caller's own abort instead of reporting a timeout", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                    }),
            ),
        );
        const controller = new AbortController();
        const pending = requestJson("/api", { method: "GET", fetchInit: undefined, signal: controller.signal }).catch(
            (error: unknown) => error,
        );
        controller.abort();

        expect(await pending).toMatchObject({ name: "AbortError" });
    });

    it("keeps the URL's query string out of http errors and exposes the API error code", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({ error: { code: "idempotency_key_reused", message: "no" } }, { status: 409 }),
            ),
        );
        const error = (await requestJson("https://shop.test/api/checkout?token=secret", {
            method: "POST",
            fetchInit: undefined,
            signal: new AbortController().signal,
        }).catch((caught: unknown) => caught)) as TransxactReactError;

        expect(error.code).toBe("http_error");
        expect(error.status).toBe(409);
        expect(error.apiCode).toBe("idempotency_key_reused");
        expect(error.message).not.toContain("secret");
        expect(error.message).toContain("/api/checkout");
    });
});

describe("validateHostedUrl allowedHosts", () => {
    it("accepts only the listed hosts when a list is given", () => {
        expect(validateHostedUrl("https://transxact.io/c/cs_1", ["transxact.io"])).toBe("https://transxact.io/c/cs_1");
        expect(() => validateHostedUrl("https://evil.test/c/cs_1", ["transxact.io"])).toThrow(/not allowed/);
        expect(() => validateHostedUrl("https://transxact.io.evil.test/", ["transxact.io"])).toThrow(/not allowed/);
    });

    it.each(["javascript:alert(1)", "data:text/html,hi", "http://example.com/c/cs_1", "ftp://transxact.io/"])(
        "rejects %s",
        (value) => {
            expect(() => validateHostedUrl(value)).toThrow(TransxactReactError);
        },
    );
});

describe("useCheckoutReturn hardening", () => {
    it("rejects a Checkout Session whose id is not the one asked for", async () => {
        const retrieveSession = vi.fn(async () => ({ id: "cs_other", status: "succeeded" as const }));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await advance(0);

        expect(result.current.state).toBe("error");
        expect((result.current.error as TransxactReactError).code).toBe("invalid_response");
        expect(result.current.session).toBeUndefined();
    });

    it("retries a transient failure and then settles", async () => {
        const retrieveSession = vi
            .fn()
            .mockRejectedValueOnce(new TransxactReactError("http_error", "boom", { status: 503 }))
            .mockResolvedValue({ id: "cs_123", status: "succeeded" });
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await advance(0);
        await advance(1500);

        expect(retrieveSession).toHaveBeenCalledTimes(2);
        expect(result.current.state).toBe("settled");
    });

    it("gives up after the configured number of consecutive transient failures", async () => {
        const retrieveSession = vi.fn().mockRejectedValue(new TransxactReactError("timeout", "slow"));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession, polling: { retries: 1 } }));
        await advance(0);
        await advance(1500);

        expect(retrieveSession).toHaveBeenCalledTimes(2);
        expect(result.current.state).toBe("error");
    });

    it.each([401, 404])("does not retry HTTP %i", async (status) => {
        const retrieveSession = vi.fn().mockRejectedValue(new TransxactReactError("http_error", "no", { status }));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSession }));
        await advance(0);
        await advance(10_000);

        expect(retrieveSession).toHaveBeenCalledTimes(1);
        expect(result.current.state).toBe("error");
    });
});
