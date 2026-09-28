# 05: `retrieveSessionUrl` shorthand and provider-level Return page defaults

**What to build:** Let a Merchant confirm on the Return page without writing any fetch code, and configure it once in the provider. Instead of a function, the Merchant gives a URL. It's either a fixed URL, to which the SDK adds `session_id` as a query parameter, or a function that builds the URL from the session id. The SDK GETs it with the Merchant's fetch options and treats the JSON response as the Checkout Session. The provider also supplies polling defaults. See the spec's "URL shorthand contract" and "Configuration" decisions.

**Blocked by:** 03 — `createSessionUrl` shorthand and `<TransxactProvider>`; 04 — Return page confirmation via a Merchant-supplied function

**Status:** done

- [x] `useCheckoutReturn` accepts `retrieveSessionUrl` as a string or as a function from session id to URL.
- [x] With a string, the SDK sends `GET` to that URL (resolved against the current page) with the `session_id` query parameter set, keeping any existing query parameters. With a function, it sends `GET` to the URL the function returns.
- [x] The Merchant's `fetchInit` (headers, credentials) is applied to the request, and the request is aborted under the same conditions as in 04.
- [x] Non-2xx responses give `http_error` with the status and body. Responses that aren't JSON, or have no valid Checkout Session status, give `invalid_response`, and in both cases `state` becomes `error`.
- [x] `TransxactProvider` accepts `retrieveSession`, `retrieveSessionUrl` and `polling` defaults, with the same precedence rules as 03 (props beat the provider, a function beats a URL at the same level, a prop-level URL beats a provider-level function). Per-hook `polling` values override the provider's field by field.
- [x] With neither props nor provider configured and a `session_id` present, `state` becomes `error` with code `config_missing`.
- [x] Tests use a stubbed global `fetch` and check the URL, method and headers of each request, including a pending→succeeded polling run through the shorthand.
