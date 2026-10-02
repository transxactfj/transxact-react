# @transxact/react

React hooks and components for taking payments with [Transxact](https://transxact.io) hosted Checkout Sessions — M-PAiSA and MyCash, in FJD.

`@transxact/react` is **client-only**. It never holds a Transxact key and never calls Transxact: every request goes to _your_ server (the **Merchant backend**), which uses [`@transxact/node`](https://www.npmjs.com/package/@transxact/node) and your secret key. The SDK covers the two browser legs of a payment:

1. **Pay** — ask the Merchant backend to create a Checkout Session, then send the Customer to its hosted URL.
2. **Return page** — when the Customer comes back, ask the Merchant backend what actually happened.

It never takes an amount. Prices are decided by the Merchant backend, where the Customer can't edit them.

## Install

```bash
npm install @transxact/react
```

Requires React 18 or later (React DOM). Works with Next.js (App Router and Pages), Vite, Remix and other React DOM setups; every export is marked `"use client"`.

## Quickstart

### 1. Pay button

```tsx
import { CheckoutButton, TransxactProvider } from "@transxact/react";

export function Cart({ orderId }: { orderId: string }) {
    return (
        <TransxactProvider createSessionUrl="/api/checkout" retrieveSessionUrl="/api/checkout">
            <CheckoutButton payload={{ orderId }} className="btn">
                Pay with M-PAiSA or MyCash
            </CheckoutButton>
        </TransxactProvider>
    );
}
```

Clicking the button POSTs `{ orderId }` to `/api/checkout` with an `Idempotency-Key` header, then sends the Customer to the returned `hostedUrl`. While that happens the button is `disabled` and `aria-busy`, and repeat clicks are ignored.

### 2. Return page

Transxact sends the Customer back to your `successUrl` or `cancelUrl` with `?session_id=cs_…` appended.

```tsx
import { useCheckoutReturn } from "@transxact/react";

export function CheckoutReturn() {
    const { state, session, error, refresh } = useCheckoutReturn({ retrieveSessionUrl: "/api/checkout" });

    if (state === "missing") return <p>No payment to show.</p>;
    if (state === "error") return <button onClick={refresh}>Couldn't check your payment — try again</button>;
    if (state === "timed_out") return <p>Still confirming your payment. We'll email you when it's done.</p>;
    if (state !== "settled") return <p>Confirming your payment…</p>;

    switch (session?.status) {
        case "succeeded":
            return <p>Paid — thank you!</p>;
        case "failed":
            return <p>The payment didn't go through.</p>;
        case "cancelled":
            return <p>The payment was cancelled.</p>;
    }
}
```

`state` is what the hook is doing; `session.status` is the payment. They are deliberately separate, so "our request failed" (`state === "error"`) is never confused with "the payment failed" (`session.status === "failed"`).

### 3. Merchant backend (Next.js App Router)

Written against `@transxact/node` 0.4.45 or later: the secret key goes in `token`, and `environment` is optional (it defaults to the production API).

```ts
// app/api/checkout/route.ts — server-only; the secret key never reaches the browser.
import { TransxactApiClient, TransxactApiError } from "@transxact/node";

const transxact = new TransxactApiClient({ token: process.env.TRANSXACT_SECRET_KEY! });

// Create: the browser sends what is being bought; the price is looked up here.
export async function POST(request: Request) {
    const { orderId } = await request.json();
    const order = await findOrder(orderId); // your own lookup
    if (!order) return Response.json({ error: "unknown_order" }, { status: 404 });

    const session = await transxact.checkoutSessions.create({
        idempotencyKey: request.headers.get("Idempotency-Key") ?? crypto.randomUUID(),
        amount: order.totalCents,
        currency: "FJD",
        successUrl: "https://shop.example/checkout/return",
        cancelUrl: "https://shop.example/checkout/return",
        metadata: { orderId },
    });
    return Response.json({ id: session.id, hostedUrl: session.hostedUrl });
}

// Retrieve: the Return page asks what actually happened.
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get("session_id");
    if (!id) return Response.json({ error: "missing_session_id" }, { status: 400 });
    try {
        const session = await transxact.checkoutSessions.retrieve({ id });
        return Response.json({ id: session.id, status: session.status });
    } catch (error) {
        const status = error instanceof TransxactApiError ? (error.statusCode ?? 502) : 502;
        return Response.json({ error: "lookup_failed" }, { status });
    }
}
```

Forwarding the browser's `Idempotency-Key` means a retried request — say, after a dropped mobile connection — returns the same Checkout Session instead of creating a second one.

### Your own functions instead of URLs

When your Merchant backend needs a different request shape, auth, or a GraphQL/RPC client, pass functions. You control the whole request; the SDK still supplies the Idempotency-Key and abort signal, validates `hostedUrl`, and polls.

```tsx
import { TransxactProvider } from "@transxact/react";

export function Payments({ children }: { children: React.ReactNode }) {
    return (
        <TransxactProvider
            createSession={async ({ idempotencyKey, signal }) => {
                const response = await fetch("/api/orders/current/pay", {
                    method: "POST",
                    headers: { "Idempotency-Key": idempotencyKey },
                    signal,
                });
                if (!response.ok) throw new Error("Couldn't start the payment");
                return response.json(); // must include hostedUrl
            }}
            retrieveSession={async (sessionId, { signal }) => {
                const response = await fetch(`/api/payments/${sessionId}`, { signal });
                if (!response.ok) throw new Error("Couldn't check the payment");
                return response.json(); // must include status
            }}
        >
            {children}
        </TransxactProvider>
    );
}
```

## The Return page is a hint, not proof

Transxact appends `session_id` to **both** `successUrl` and `cancelUrl`, and sends the Customer to `cancelUrl` for failed and expired Checkout Sessions too. Landing on a URL tells you nothing about the outcome, which is why `useCheckoutReturn` always asks the Merchant backend and polls while the Checkout Session is still `pending`.

Even then, the Return page is only for showing the Customer something. **Fulfil orders from Transxact's webhooks (or a server-side lookup), never from the redirect** — a Customer may close the tab before the Return page loads. On your Merchant backend, check each webhook's signature with `verifyWebhookSignature` from `@transxact/node/webhooks` before trusting it ([webhook verification guide](https://docs.transxact.io)).

## API

### `<TransxactProvider>`

Optional defaults for everything beneath it. Props on a hook or component always win.

| Prop | Type | |
|---|---|---|
| `createSession` | `(context) => Promise<{ hostedUrl }>` | Your own function to create a Checkout Session |
| `createSessionUrl` | `string` | URL shorthand for creating (see [wire contract](#url-shorthand-wire-contract)) |
| `retrieveSession` | `(sessionId, { signal }) => Promise<Session>` | Your own function to look up a Checkout Session |
| `retrieveSessionUrl` | `string \| (sessionId) => string` | URL shorthand for looking up |
| `fetchInit` | `RequestInit` (no body/method/signal) | Extra options for the URL shorthands, e.g. `{ credentials: "include", headers: { "x-csrf-token": token } }` |
| `polling` | `{ intervalMs?, maxIntervalMs?, timeoutMs? }` | Return page polling defaults |

**Precedence:** props beat the provider; at the same level a function beats a URL (so a URL passed as a prop beats a function on the provider).

### `useCheckout(options)` and `<CheckoutButton>`

```ts
const { start, reset, state, error } = useCheckout({ createSessionUrl: "/api/checkout", payload: { orderId } });
```

| Option | |
|---|---|
| `createSession` / `createSessionUrl` | How to reach the Merchant backend (or set on the provider) |
| `payload` | JSON sent by `createSessionUrl` — what is being bought, never the price |
| `onError(error)` | Called whenever `state` becomes `error` |
| `redirect(hostedUrl)` | Replace the default full-page `location.assign`, e.g. to record analytics first. `state` stays `redirecting` (and the button disabled) afterwards, so if your `redirect` doesn't leave the page — a new tab, a popup — call `reset()` once it's done |

- `state`: `idle → creating → redirecting`, or `error`.
- `start()` begins a **Checkout attempt**, or retries the current one after an error. It's ignored while one is under way.
- `reset()` abandons the Checkout attempt (aborting any request) and returns to `idle`.
- Each Checkout attempt has one Idempotency-Key: a retry after an error reuses it; `reset()`, a remount, or the Customer coming back with the browser's Back button starts a new one. With `createSessionUrl`, a changed `payload` (the Customer edited the cart after an error) also starts a new one. With your own `createSession` the SDK can't see what you send, so call `reset()` when what the Customer is buying changes.
- A `createSession` function receives `{ idempotencyKey, signal }` — forward the key to Transxact as the `Idempotency-Key` header (`idempotencyKey` in `@transxact/node`).
- The returned `hostedUrl` must be `https:` (`http:` only on localhost), so a misconfigured Merchant backend can't redirect Customers somewhere unexpected.

`<CheckoutButton>` takes the same options plus any `<button>` props and a `ref`. It is unstyled, defaults to `type="button"`, and runs your `onClick` first — call `event.preventDefault()` there (e.g. after failed validation) to stop the Checkout attempt.

`<CheckoutButton>` is for redirects that leave the page. It has no `reset`, so once it has redirected it stays disabled until the page is left or restored from the back/forward cache. If your `redirect` keeps the Customer on the page (a new tab, a popup), build the button with `useCheckout` instead and call `reset()` when you're done.

### `useCheckoutReturn(options)`

```ts
const { state, session, error, refresh } = useCheckoutReturn<MySession>({ retrieveSessionUrl: "/api/checkout" });
```

| Option | |
|---|---|
| `retrieveSession` / `retrieveSessionUrl` | How to reach the Merchant backend (or set on the provider) |
| `sessionId` | Use this instead of the `session_id` query parameter (e.g. from your router) |
| `polling` | `{ intervalMs = 1500, maxIntervalMs = 8000, timeoutMs = 60000 }`; overrides the provider field by field |

- `state`: `idle` (server render and first client render) → `missing` (no session id) or `loading` → `settled`, or `polling` → `settled` / `timed_out`; `error` at any point.
- While the Checkout Session is `pending` the hook polls with exponential backoff (1.5 s, 3 s, 6 s, then every 8 s) and gives up with `timed_out` 60 s after the first lookup.
- `refresh()` starts over, e.g. after `error` or `timed_out`.
- The hook is generic: return extra fields (amount, metadata…) from your Merchant backend and `session` is typed accordingly. `@transxact/node`'s `CheckoutSession` fits as-is.

### Errors

Errors raised by the SDK are `TransxactReactError` with a `code`:

| `code` | When |
|---|---|
| `config_missing` | Neither props nor provider say how to reach the Merchant backend |
| `http_error` | A URL shorthand got a non-2xx response; `error.status` and `error.body` (parsed JSON, or raw text) are set |
| `invalid_response` | The response isn't JSON, has no valid `hostedUrl`, or has no valid Checkout Session status |

Errors thrown by your own `createSession` / `retrieveSession` functions are passed through unchanged.

## URL shorthand wire contract

What your Merchant backend must implement to use `createSessionUrl` / `retrieveSessionUrl`:

**Create** — `POST <createSessionUrl>`

- Headers: `Content-Type: application/json`, `Idempotency-Key: <uuid>` (plus any `fetchInit` headers; the SDK's two always win).
- Body: your `payload` as JSON, or `{}`.
- Respond `2xx` with JSON containing `hostedUrl` (a Transxact hosted URL). Other fields are ignored.

**Retrieve** — `GET <retrieveSessionUrl>`

- A string URL gets `session_id=<cs_…>` added to its query; a function `(sessionId) => url` is used as-is.
- Respond `2xx` with JSON containing `status`: one of `pending`, `succeeded`, `failed`, `cancelled`. Any other fields are passed through to `session`.

Anything else becomes `http_error` or `invalid_response` (see [Errors](#errors)).

## Testing in Test mode

Use an `sk_test_…` key on the Merchant backend; Test mode Checkout Sessions never move real money. To drive a Checkout Session to a final status without a real Wallet, call the Test mode transition endpoint from your server — it is undocumented and only accepts Test mode Checkout Sessions:

```bash
curl -X POST https://api.transxact.io/v1/checkout-sessions/cs_…/test-transition \
  -H "Authorization: Bearer $TRANSXACT_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"succeeded","provider":"mpaisa"}'
```

`status` can be `succeeded` (with `provider`: `mpaisa` or `mycash`), `failed` or `cancelled`. Then load your Return page with `?session_id=cs_…` to watch it settle.

## License

Apache-2.0
