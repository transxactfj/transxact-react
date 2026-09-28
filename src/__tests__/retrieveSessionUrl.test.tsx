import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { TransxactProvider, type TransxactReactError, useCheckoutReturn } from "../index";

type Respond = (url: string) => Response;

/** The Merchant backend, as the browser sees it: a stubbed global fetch. */
function merchantBackend(respond: Respond = () => Response.json({ id: "cs_123", status: "succeeded" })) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => respond(String(input)));
    vi.stubGlobal("fetch", fetchMock);
    return {
        fetchMock,
        request(index = 0) {
            const [input, init = {}] = fetchMock.mock.calls[index] ?? [];
            return {
                url: new URL(String(input), window.location.href),
                method: init.method,
                headers: new Headers(init.headers),
                credentials: init.credentials,
                signal: init.signal ?? undefined,
            };
        },
    };
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
    window.history.replaceState(null, "", "/checkout/return?session_id=cs_123");
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("retrieveSessionUrl shorthand", () => {
    it("GETs a fixed URL with session_id added, keeping its existing query parameters", async () => {
        const backend = merchantBackend();
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSessionUrl: "/api/checkout?shop=suva" }));
        await flush();

        const { url, method } = backend.request();
        expect(method).toBe("GET");
        expect(url.pathname).toBe("/api/checkout");
        expect(url.searchParams.get("shop")).toBe("suva");
        expect(url.searchParams.get("session_id")).toBe("cs_123");
        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("succeeded");
    });

    it("GETs the URL a function builds from the session id", async () => {
        const backend = merchantBackend();
        renderHook(() => useCheckoutReturn({ retrieveSessionUrl: (id) => `/api/checkout-sessions/${id}` }));
        await flush();
        expect(backend.request().url.pathname).toBe("/api/checkout-sessions/cs_123");
        expect(backend.request().url.search).toBe("");
    });

    it("polls through the shorthand from pending to succeeded", async () => {
        let calls = 0;
        const backend = merchantBackend(() =>
            Response.json({ id: "cs_123", status: ++calls < 3 ? "pending" : "succeeded" }),
        );
        const { result } = renderHook(() =>
            useCheckoutReturn({ retrieveSessionUrl: "/api/checkout", polling: { intervalMs: 1000 } }),
        );
        await flush();
        expect(result.current.state).toBe("polling");
        await advance(1000);
        await advance(2000);

        expect(backend.fetchMock).toHaveBeenCalledTimes(3);
        expect(result.current.state).toBe("settled");
        expect(result.current.session?.status).toBe("succeeded");
    });

    it("turns a non-2xx response into http_error with the status and body", async () => {
        merchantBackend(() => Response.json({ error: "not_found" }, { status: 404 }));
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSessionUrl: "/api/checkout" }));
        await flush();

        const error = result.current.error as TransxactReactError;
        expect(result.current.state).toBe("error");
        expect(error.code).toBe("http_error");
        expect(error.status).toBe(404);
        expect(error.body).toEqual({ error: "not_found" });
    });

    it.each([
        ["a non-JSON response", () => new Response("<html></html>")],
        ["a response without a valid status", () => Response.json({ id: "cs_123", status: "paid" })],
    ])("turns %s into invalid_response", async (_label, respond) => {
        merchantBackend(respond);
        const { result } = renderHook(() => useCheckoutReturn({ retrieveSessionUrl: "/api/checkout" }));
        await flush();
        expect(result.current.state).toBe("error");
        expect((result.current.error as TransxactReactError).code).toBe("invalid_response");
    });

    it("aborts the request on unmount", async () => {
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", fetchMock);
        const { unmount } = renderHook(() => useCheckoutReturn({ retrieveSessionUrl: "/api/checkout" }));
        await flush();
        unmount();
        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });
});

describe("TransxactProvider on the Return page", () => {
    function wrapperWith(props: Parameters<typeof TransxactProvider>[0]) {
        return ({ children }: { children: ReactNode }) => <TransxactProvider {...props}>{children}</TransxactProvider>;
    }

    it("supplies retrieveSessionUrl and fetchInit", async () => {
        const backend = merchantBackend();
        const wrapper = wrapperWith({
            retrieveSessionUrl: (id) => `/api/checkout/${id}`,
            fetchInit: { credentials: "include", headers: { "x-csrf-token": "t0k" } },
        });
        const { result } = renderHook(() => useCheckoutReturn(), { wrapper });
        await flush();

        const request = backend.request();
        expect(request.url.pathname).toBe("/api/checkout/cs_123");
        expect(request.credentials).toBe("include");
        expect(request.headers.get("x-csrf-token")).toBe("t0k");
        expect(result.current.state).toBe("settled");
    });

    it("supplies a retrieveSession function", async () => {
        const retrieveSession = vi.fn(async (id: string) => ({ id, status: "cancelled" as const }));
        const { result } = renderHook(() => useCheckoutReturn(), { wrapper: wrapperWith({ retrieveSession }) });
        await flush();
        expect(retrieveSession).toHaveBeenCalledWith("cs_123", expect.anything());
        expect(result.current.session?.status).toBe("cancelled");
    });

    describe("precedence", () => {
        it("a prop function beats a provider URL", async () => {
            const backend = merchantBackend();
            const retrieveSession = vi.fn(async (id: string) => ({ id, status: "succeeded" as const }));
            renderHook(() => useCheckoutReturn({ retrieveSession }), {
                wrapper: wrapperWith({ retrieveSessionUrl: "/api/provider" }),
            });
            await flush();
            expect(retrieveSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });

        it("a prop URL beats a provider function", async () => {
            const backend = merchantBackend();
            const providerRetrieve = vi.fn(async (id: string) => ({ id, status: "succeeded" as const }));
            renderHook(() => useCheckoutReturn({ retrieveSessionUrl: "/api/prop" }), {
                wrapper: wrapperWith({ retrieveSession: providerRetrieve }),
            });
            await flush();
            expect(backend.request().url.pathname).toBe("/api/prop");
            expect(providerRetrieve).not.toHaveBeenCalled();
        });

        it("a prop function beats a prop URL", async () => {
            const backend = merchantBackend();
            const retrieveSession = vi.fn(async (id: string) => ({ id, status: "succeeded" as const }));
            renderHook(() => useCheckoutReturn({ retrieveSession, retrieveSessionUrl: "/api/prop" }));
            await flush();
            expect(retrieveSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });

        it("a provider function beats a provider URL", async () => {
            const backend = merchantBackend();
            const retrieveSession = vi.fn(async (id: string) => ({ id, status: "succeeded" as const }));
            renderHook(() => useCheckoutReturn(), {
                wrapper: wrapperWith({ retrieveSession, retrieveSessionUrl: "/api/provider" }),
            });
            await flush();
            expect(retrieveSession).toHaveBeenCalledTimes(1);
            expect(backend.fetchMock).not.toHaveBeenCalled();
        });
    });

    it("supplies polling defaults that per-hook polling overrides field by field", async () => {
        const retrieveSession = vi.fn(async (id: string) => ({ id, status: "pending" as const }));
        const wrapper = wrapperWith({ retrieveSession, polling: { intervalMs: 500, timeoutMs: 10_000 } });
        const { result } = renderHook(() => useCheckoutReturn({ polling: { timeoutMs: 2000 } }), { wrapper });
        await flush();

        await advance(500); // provider's intervalMs
        expect(retrieveSession).toHaveBeenCalledTimes(2);
        await advance(1500); // hook's timeoutMs (2000) reached
        expect(result.current.state).toBe("timed_out");
    });

    it("fails with config_missing when neither props nor provider say how to reach the Merchant backend", async () => {
        const { result } = renderHook(() => useCheckoutReturn(), { wrapper: wrapperWith({}) });
        await flush();
        expect(result.current.state).toBe("error");
        expect((result.current.error as TransxactReactError).code).toBe("config_missing");
    });
});
