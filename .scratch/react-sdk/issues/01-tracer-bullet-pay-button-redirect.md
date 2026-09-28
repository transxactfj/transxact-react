# 01: Tracer bullet — pay button redirects via a Merchant-supplied function

**What to build:** The first complete path through the package. A Merchant renders a pay button (or uses the `useCheckout` hook) with their own async `createSession` function. When the Customer clicks, the SDK calls that function, checks the returned `hostedUrl`, and sends the Customer to the Checkout Session's hosted URL. The hook reports its progress as `state` and failures as a typed SDK error. This ticket also lays down the package skeleton (build, lint, typecheck, test, CI), so every later ticket lands on a green `ci` script. See the spec's "Checkout attempt behaviour" and "Packaging" decisions, and ADR-0001.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Public exports include `useCheckout`, `CheckoutButton`, the SDK error class, and the core types: Checkout Session status, `CheckoutSessionLike`, the create result, the create context, and the create function signature.
- [x] `useCheckout({ createSession })` returns `start`, `reset`, `state` and `error`. `state` goes `idle → creating → redirecting` on success and `idle → creating → error` on failure. `reset` returns to `idle` and clears `error`.
- [x] `hostedUrl` must parse as a URL with `https:`. `http:` is accepted only for localhost or loopback hosts. Anything else, or a missing or non-string `hostedUrl`, gives an error with code `invalid_response`, and no redirect happens.
- [x] The default redirect is a full-page `location.assign(hostedUrl)`. A `redirect` option replaces it and receives the validated URL.
- [x] If the Merchant's function throws, the error goes through unchanged (non-Error values are wrapped in an Error), `state` becomes `error`, and `onError` is called.
- [x] Calling `start` with no create function configured gives an error with code `config_missing`.
- [x] `CheckoutButton` renders a plain, unstyled `<button>` that defaults to `type="button"`. It forwards standard button props and a ref, and calls `start` on click.
- [x] The hook and button take no amount; their typed props have no amount field.
- [x] Server rendering (`renderToString`) of the button in a non-DOM environment doesn't throw and never touches `window`.
- [x] The build outputs ESM, CJS and type declarations for both, each JS file begins with the `"use client"` directive, and the exports map resolves both formats.
- [x] Tests go through the public API only (React Testing Library in jsdom), with a stubbed Merchant function and the `redirect` option as the boundaries.
- [x] A CI workflow runs lint, typecheck, test and build on push and PR, and the `ci` script passes locally.
