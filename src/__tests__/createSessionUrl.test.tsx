import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CheckoutButton, TransxactProvider, type TransxactReactError, useCheckout } from "../index";

const HOSTED_URL = "https://transxact.io/c/cs_123";

/** The Merchant backend, as the browser sees it: a stubbed global fetch. */
function merchantBackend(respond: () => Response = () => Response.json({ id: "cs_123", hostedUrl: HOSTED_URL })) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond());
    vi.stubGlobal("fetch", fetchMock);
    return {
        fetchMock,
        request(index = 0) {
            const [input, init = {}] = fetchMock.mock.calls[index] ?? [];
            return {
                url: String(input),
                method: init.method,
                headers: new Headers(init.headers),
                body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
                signal: init.signal ?? undefined,
                credentials: init.credentials,
            };
        },
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

async function startWith(
    options: Parameters<typeof useCheckout>[0],
    wrapper?: (props: { children: ReactNode }) => ReactNode,
) {
    const redirect = vi.fn();
    const hook = renderHook(() => useCheckout({ redirect, ...options }), { wrapper });
    await act(() => hook.result.current.start());
    return { ...hook, redirect };
}

describe("createSessionUrl shorthand", () => {
    it("POSTs the payload as JSON with the Idempotency-Key header and redirects to the returned hosted URL", async () => {
        const backend = merchantBackend();
        const { redirect } = await startWith({ createSessionUrl: "/api/checkout", payload: { orderId: "ord_42" } });

        const request = backend.request();
        expect(request.url).toBe("/api/checkout");
        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toBe("application/json");
        expect(request.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
        expect(request.body).toEqual({ orderId: "ord_42" });
        expect(redirect).toHaveBeenCalledWith(HOSTED_URL);
    });

    it("sends exactly the Merchant's payload — never an amount or any other field", async () => {
        const backend = merchantBackend();
        await startWith({ createSessionUrl: "/api/checkout", payload: { cartId: "c1" } });
        expect(Object.keys(backend.request().body)).toEqual(["cartId"]);
    });

    it("sends an empty object when there is no payload", async () => {
        const backend = merchantBackend();
        await startWith({ createSessionUrl: "/api/checkout" });
        expect(backend.request().body).toEqual({});
    });

    it("sends the same Idempotency-Key header on a retry after an error", async () => {
        let calls = 0;
        const backend = merchantBackend(() =>
            ++calls === 1 ? new Response("upstream down", { status: 502 }) : Response.json({ hostedUrl: HOSTED_URL }),
        );
        const { result } = await startWith({ createSessionUrl: "/api/checkout" });
        await act(() => result.current.start());
        expect(backend.request(0).headers.get("idempotency-key")).toBe(
            backend.request(1).headers.get("idempotency-key"),
        );
    });

    it("starts a new Checkout attempt, with a new Idempotency-Key, when the payload changes after an error", async () => {
        let calls = 0;
        const backend = merchantBackend(() =>
            ++calls === 1
                ? Response.json({ error: "out_of_stock" }, { status: 409 })
                : Response.json({ hostedUrl: HOSTED_URL }),
        );
        const redirect = vi.fn();
        const { result, rerender } = renderHook(
            ({ orderId }) => useCheckout({ createSessionUrl: "/api/checkout", payload: { orderId }, redirect }),
            { initialProps: { orderId: "ord_1" } },
        );
        await act(() => result.current.start());
        expect(result.current.state).toBe("error");

        rerender({ orderId: "ord_2" });
        await act(() => result.current.start());

        expect(backend.request(1).body).toEqual({ orderId: "ord_2" });
        expect(backend.request(1).headers.get("idempotency-key")).not.toBe(
            backend.request(0).headers.get("idempotency-key"),
        );
        expect(redirect).toHaveBeenCalledWith(HOSTED_URL);
    });

    it("keeps the Idempotency-Key on retry when an equal payload is passed as a new object", async () => {
        let calls = 0;
        const backend = merchantBackend(() =>
            ++calls === 1 ? new Response("down", { status: 502 }) : Response.json({ hostedUrl: HOSTED_URL }),
        );
        const { result, rerender } = renderHook(
            ({ orderId }) =>
                useCheckout({ createSessionUrl: "/api/checkout", payload: { orderId }, redirect: vi.fn() }),
            { initialProps: { orderId: "ord_1" } },
        );
        await act(() => result.current.start());
        rerender({ orderId: "ord_1" });
        await act(() => result.current.start());
        expect(backend.request(1).headers.get("idempotency-key")).toBe(
            backend.request(0).headers.get("idempotency-key"),
        );
    });

    it("turns a non-2xx response into http_error with the status and parsed body", async () => {
        merchantBackend(() => Response.json({ error: { code: "out_of_stock" } }, { status: 409 }));
        const { result, redirect } = await startWith({ createSessionUrl: "/api/checkout" });

        const error = result.current.error as TransxactReactError;
        expect(result.current.state).toBe("error");
        expect(error.code).toBe("http_error");
        expect(error.status).toBe(409);
        expect(error.body).toEqual({ error: { code: "out_of_stock" } });
        expect(redirect).not.toHaveBeenCalled();
    });

    it("keeps a non-JSON error body as raw text", async () => {
        merchantBackend(() => new Response("Bad Gateway", { status: 502 }));
        const { result } = await startWith({ createSessionUrl: "/api/checkout" });
        expect((result.current.error as TransxactReactError).body).toBe("Bad Gateway");
    });

    it.each([
        ["a non-JSON 2xx response", () => new Response("<html>ok</html>", { status: 200 })],
        ["a 2xx response without hostedUrl", () => Response.json({ id: "cs_123" })],
    ])("turns %s into invalid_response", async (_label, respond) => {
        merchantBackend(respond);
        const { result, redirect } = await startWith({ createSessionUrl: "/api/checkout" });
        expect((result.current.error as TransxactReactError).code).toBe("invalid_response");
        expect(redirect).not.toHaveBeenCalled();
    });

    it("aborts the request on unmount", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", fetchMock);
        const { result, unmount } = renderHook(() =>
            useCheckout({ createSessionUrl: "/api/checkout", redirect: vi.fn() }),
        );

        await act(async () => void result.current.start());
        unmount();

        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("aborts the request on reset", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", fetchMock);
        const { result } = renderHook(() => useCheckout({ createSessionUrl: "/api/checkout", redirect: vi.fn() }));

        await act(async () => void result.current.start());
        act(() => result.current.reset());

        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("works from CheckoutButton", async () => {
        const backend = merchantBackend();
        const redirect = vi.fn();
        render(
            <CheckoutButton createSessionUrl="/api/checkout" payload={{ orderId: "ord_1" }} redirect={redirect}>
                Pay
            </CheckoutButton>,
        );
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pay" })));
        expect(backend.request().body).toEqual({ orderId: "ord_1" });
        expect(redirect).toHaveBeenCalledWith(HOSTED_URL);
    });
});

describe("TransxactProvider", () => {
    it("supplies createSessionUrl and fetchInit to every Checkout attempt beneath it", async () => {
        const backend = merchantBackend();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <TransxactProvider
                createSessionUrl="/api/checkout"
                fetchInit={{ credentials: "include", headers: { "x-csrf-token": "t0k" } }}
            >
                {children}
            </TransxactProvider>
        );
        await startWith({ payload: { orderId: "ord_9" } }, wrapper);

        const request = backend.request();
        expect(request.url).toBe("/api/checkout");
        expect(request.credentials).toBe("include");
        expect(request.headers.get("x-csrf-token")).toBe("t0k");
        expect(request.body).toEqual({ orderId: "ord_9" });
    });

    it("never lets fetchInit override the SDK's Content-Type or Idempotency-Key", async () => {
        const backend = merchantBackend();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <TransxactProvider
                createSessionUrl="/api/checkout"
                fetchInit={{ headers: { "Content-Type": "text/plain", "Idempotency-Key": "fixed" } }}
            >
                {children}
            </TransxactProvider>
        );
        await startWith({}, wrapper);
        expect(backend.request().headers.get("content-type")).toBe("application/json");
        expect(backend.request().headers.get("idempotency-key")).not.toBe("fixed");
    });

    it("supplies a createSession function", async () => {
        const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <TransxactProvider createSession={createSession}>{children}</TransxactProvider>
        );
        const { redirect } = await startWith({}, wrapper);
        expect(createSession).toHaveBeenCalledTimes(1);
        expect(redirect).toHaveBeenCalledWith(HOSTED_URL);
    });

    describe("precedence", () => {
        it("a prop function beats a provider URL", async () => {
            const backend = merchantBackend();
            const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
            const wrapper = ({ children }: { children: ReactNode }) => (
                <TransxactProvider createSessionUrl="/api/provider">{children}</TransxactProvider>
            );
            await startWith({ createSession }, wrapper);
            expect(createSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });

        it("a prop URL beats a provider function", async () => {
            const backend = merchantBackend();
            const providerCreate = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
            const wrapper = ({ children }: { children: ReactNode }) => (
                <TransxactProvider createSession={providerCreate}>{children}</TransxactProvider>
            );
            await startWith({ createSessionUrl: "/api/prop" }, wrapper);
            expect(backend.request().url).toBe("/api/prop");
            expect(providerCreate).not.toHaveBeenCalled();
        });

        it("a prop function beats a prop URL", async () => {
            const backend = merchantBackend();
            const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
            await startWith({ createSession, createSessionUrl: "/api/prop" });
            expect(createSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });

        it("a provider function beats a provider URL", async () => {
            const backend = merchantBackend();
            const createSession = vi.fn().mockResolvedValue({ hostedUrl: HOSTED_URL });
            const wrapper = ({ children }: { children: ReactNode }) => (
                <TransxactProvider createSession={createSession} createSessionUrl="/api/provider">
                    {children}
                </TransxactProvider>
            );
            await startWith({}, wrapper);
            expect(createSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });
    });

    it("fails with config_missing when neither props nor provider say how to reach the Merchant backend", async () => {
        const wrapper = ({ children }: { children: ReactNode }) => <TransxactProvider>{children}</TransxactProvider>;
        const { result } = await startWith({}, wrapper);
        expect((result.current.error as TransxactReactError).code).toBe("config_missing");
    });
});
