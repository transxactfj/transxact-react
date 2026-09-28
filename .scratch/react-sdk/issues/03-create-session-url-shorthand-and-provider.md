# 03: `createSessionUrl` shorthand and `<TransxactProvider>`

**What to build:** Let a Merchant start a Checkout attempt without writing any fetch code, and configure it once for the whole app. Instead of a function, the Merchant gives a URL. The SDK POSTs the Merchant's payload as JSON with the Idempotency-Key header and expects `hostedUrl` back. An optional provider holds these create settings and fetch options (e.g. a CSRF header, `credentials`) as defaults; props on a hook or button override it. See the spec's "URL shorthand contract" and "Configuration" decisions.

**Blocked by:** 01 — Tracer bullet: pay button redirects via a Merchant-supplied function; 02 — Checkout attempt safety

**Status:** done

- [x] `useCheckout` and `CheckoutButton` accept `createSessionUrl` and an optional `payload`. The SDK sends `POST <createSessionUrl>` with `Content-Type: application/json`, an `Idempotency-Key` header equal to the Checkout attempt's key, and the payload as the JSON body (an empty object when there's no payload).
- [x] The request body is exactly the Merchant's payload; the SDK never adds an amount or any other field.
- [x] A 2xx JSON response with a string `hostedUrl` redirects as in 01; other response fields are ignored.
- [x] A non-2xx response gives an error with code `http_error`, carrying the HTTP `status` and the parsed body (raw text if it isn't JSON).
- [x] A 2xx response that isn't JSON, or has no `hostedUrl`, gives an error with code `invalid_response`.
- [x] The request is aborted on unmount and `reset`, using the signal from 02.
- [x] `TransxactProvider` accepts `createSession`, `createSessionUrl` and `fetchInit`. Its headers are merged with the SDK's own headers, and the SDK's `Content-Type` and `Idempotency-Key` always win.
- [x] Precedence: hook/button props beat the provider. Within one level, a function beats a URL. A prop-level URL beats a provider-level function.
- [x] Everything still works with no provider. With neither props nor provider configured, `start` gives `config_missing`.
- [x] Tests use a stubbed global `fetch` as the Merchant backend boundary and check the URL, method, headers and body of each request.
- [x] Server rendering of the provider wrapping a button doesn't throw.
