Status: ready-for-agent

# Spec: `@transxact/react` v1 — client-only React SDK for hosted Checkout Sessions

## Problem Statement

A Merchant building a storefront in React has no Transxact package for the browser. The only SDK, `@transxact/node`, is server-side and needs a secret key that must never reach the browser (platform ADR-0011), and Transxact's API refuses browser origins. So every Merchant hand-writes the same browser glue:

- a pay button that asks their own server for a Checkout Session and sends the Customer to its hosted URL;
- protection against double-clicks and retried requests creating duplicate Checkout Sessions;
- a Return page that works out what actually happened.

The Return page is where Merchants get it wrong. Transxact appends `session_id` to *both* the success and cancel URLs, and the hosted page uses the cancel URL for failed and expired Checkout Sessions too. So the URL alone never says whether the Customer paid, and the Checkout Session can still briefly be `pending` when the Customer arrives. A Merchant who trusts the redirect ships a Return page that shows "Paid" when nothing was paid.

## Solution

`@transxact/react`: a small, hand-written, client-only React DOM package (ADR-0001) with zero runtime dependencies. It covers the two browser legs of paying through a Checkout Session's hosted URL, and every call goes through the Merchant backend:

1. **Starting a Checkout attempt.**
   - A headless hook, plus an unstyled button built on it, asks the Merchant backend to create a Checkout Session and sends the Customer to its hosted URL.
   - The hook generates an Idempotency-Key for the Checkout attempt and guards against double-submit.
   - It never accepts an amount.
2. **Confirming on the Return page.**
   - A hook reads `session_id` and asks the Merchant backend for the Checkout Session.
   - It polls while the Checkout Session is `pending`, and reports the Checkout Session status separately from its own progress.

The Merchant connects the SDK to their backend in one of two ways. They pass their own async function, which leaves full control of URL, body, auth and cookies with the Merchant. Or they pass a URL shorthand, which uses a small, documented JSON contract. Shared settings can go on an optional provider component. Props on a hook or button override the provider.

## User Stories

1. As a Merchant, I want to install one npm package that works in any React DOM app (Next.js, Vite, Remix, CRA), so that I don't need to write the browser side of a Transxact integration myself.
2. As a Merchant, I want the package to have no runtime dependencies besides React, so that my bundle stays small and I don't take on extra supply-chain risk.
3. As a Merchant, I want the package to never ask for my secret key, so that I can't leak it into browser code by mistake.
4. As a Merchant, I want a pay button that starts a Checkout attempt when clicked, so that I can add payments with one component.
5. As a Merchant, I want the button to be unstyled and forward all standard button props (className, style, aria-*, children, ref), so that it fits my design system.
6. As a Merchant, I want a headless hook that returns `start`, `reset`, `state` and `error`, so that I can build my own trigger (a link, a menu item, a form submit) instead of the button.
7. As a Merchant, I want to supply my own async function that creates the Checkout Session, so that I control the URL, request body, auth headers and cookies my backend expects.
8. As a Merchant, I want a URL shorthand that POSTs a payload I choose as JSON and expects `hostedUrl` in the response, so that simple backends need no custom fetch code.
9. As a Merchant, I want the SDK to refuse to take an amount, so that a Customer can't change the price in devtools, and my Merchant backend stays the only place prices are set.
10. As a Merchant, I want to pass an order or cart reference as the payload, so that my Merchant backend can look up the price itself.
11. As a Merchant, I want the SDK to generate an Idempotency-Key for each Checkout attempt and hand it to my function (or send it as an `Idempotency-Key` header in the shorthand), so that I can forward it to Transxact and a retried request replays the same Checkout Session.
12. As a Merchant, I want the same Idempotency-Key reused when the Customer retries after an error, so that a response lost on a flaky mobile connection never creates a second Checkout Session.
13. As a Merchant, I want a fresh Idempotency-Key after I call `reset`, so that a genuinely new Checkout attempt isn't mistaken for a replay.
14. As a Merchant, I want repeated clicks ignored while a Checkout attempt is being created or redirected, so that double-clicks never send duplicate requests.
15. As a Merchant, I want the button disabled and marked busy while creating or redirecting, so that the Customer can see something is happening and assistive technology announces it.
16. As a Merchant, I want the hook's `state` to move `idle → creating → redirecting`, or to `error`, so that I can render loading and error UI.
17. As a Merchant, I want errors from my Merchant backend exposed as a typed SDK error with a code (config_missing, http_error, invalid_response), the HTTP status and the parsed body, so that I can show the right message and log the rest.
18. As a Merchant, I want an `onError` callback, so that I can send failures to my error tracking without writing an effect.
19. As a Merchant, I want the SDK to reject a `hostedUrl` that isn't HTTPS (allowing http only on localhost), so that a compromised or misconfigured Merchant backend can't turn my pay button into an open redirect.
20. As a Merchant, I want to override how the redirect happens, so that I can record analytics first or test without navigating.
21. As a Merchant, I want the Customer sent to the hosted URL with a normal full-page navigation by default, so that the hosted page works exactly as Transxact designed it.
22. As a Merchant, I want the button to reset itself when the Customer comes back with the browser's Back button (a page restored from the back/forward cache), so that it doesn't stay stuck disabled in `redirecting`.
23. As a Merchant, I want an in-flight Checkout attempt aborted if the component unmounts or I call `reset`, so that no state updates happen on a component that's gone.
24. As a Merchant, I want the button to run my own `onClick` first and skip starting a Checkout attempt if I call `preventDefault`, so that I can validate a form before paying.
25. As a Merchant, I want the button to default to `type="button"`, so that putting it inside a form doesn't submit the form.
26. As a Merchant, I want a Return page hook that reads `session_id` from the URL, so that I don't parse query strings myself.
27. As a Merchant, I want to pass the session id explicitly instead, so that I can use my router's params or a custom query name.
28. As a Merchant, I want the Return page hook to confirm the Checkout Session status through my Merchant backend (a function I supply, or a URL shorthand), so that what I show matches what Transxact recorded, not what the redirect implies.
29. As a Merchant, I want the retrieve URL shorthand to accept either a fixed URL (the SDK adds `session_id` as a query parameter) or a function from id to URL, so that it fits my route shape.
30. As a Merchant, I want the hook to poll with capped exponential backoff while the Checkout Session is `pending`, so that the Customer sees the final Checkout Session status without me writing a retry loop.
31. As a Merchant, I want polling to stop as soon as the Checkout Session status is succeeded, failed or cancelled, so that no more requests are sent.
32. As a Merchant, I want polling to give up after a configurable timeout with a distinct `timed_out` state, so that I can show a "we'll email you" message instead of spinning forever.
33. As a Merchant, I want to configure the polling interval, the maximum interval and the timeout, so that I can tune them to my traffic.
34. As a Merchant, I want the hook to report its own progress as `state` (idle, loading, polling, settled, timed_out, error, missing) and the payment as `session.status`, so that "my request failed" is never confused with "the payment failed".
35. As a Merchant, I want a `missing` state when there's no `session_id`, so that I can handle someone opening the Return page directly.
36. As a Merchant, I want a `refresh` function, so that the Customer can retry after an error or a timeout.
37. As a Merchant, I want the Return page hook to return my full Checkout Session type when my Merchant backend returns more fields (amount, metadata, and so on), so that I keep type safety without casting.
38. As a Merchant already using `@transxact/node`, I want to return its Checkout Session object unchanged from my Merchant backend and have it type-check against the SDK, so that the two packages work together without either importing the other.
39. As a Merchant, I want the Return page hook to reject a response that has no valid Checkout Session status, so that a broken endpoint shows up as an error rather than a wrong screen.
40. As a Merchant, I want polling requests aborted on unmount or when the session id changes, so that stale responses never overwrite current state.
41. As a Merchant, I want an optional provider that holds the create and retrieve settings, fetch options (headers, credentials) and polling defaults, so that I configure them once for the whole app.
42. As a Merchant, I want props on a hook or button to override the provider, so that one page can use a different endpoint.
43. As a Merchant, I want every hook and component to work with no provider at all, so that a single-button integration needs no setup.
44. As a Merchant, I want a clear `config_missing` error when neither the props nor the provider say how to reach my Merchant backend, so that a setup mistake is obvious.
45. As a Merchant, I want to pass fetch options (such as a CSRF header or `credentials`) to the URL shorthands, so that they work with my backend's auth.
46. As a Merchant using Next.js App Router, I want the package marked as client code, so that I can import it from Server Components without adding my own wrapper.
47. As a Merchant using server rendering, I want every hook and component to render on the server without touching `window`, so that the SSR build doesn't crash and there's no hydration mismatch.
48. As a Merchant, I want ESM and CommonJS builds with type declarations, so that it works in modern bundlers and older test setups.
49. As a Merchant, I want a README quickstart that includes a working Merchant backend route using `@transxact/node` as it is today, so that I can finish a full integration in one sitting.
50. As a Merchant, I want the README to explain that the Return page is only a hint and that webhooks or a server-side lookup decide fulfilment, so that I don't ship goods on a redirect.
51. As a Merchant testing in Test mode, I want the README to show how to drive a Checkout Session to a final status, so that I can try my Return page end to end.
52. As a Customer, I want pressing pay to take me straight to the Checkout Session's hosted URL, so that I can pay with my Wallet without delay.
53. As a Customer, I want pressing pay twice to not charge me twice, so that I can trust the checkout.
54. As a Customer, I want the Return page to tell me the real Checkout Session status, even if the payment takes a few seconds to confirm, so that I know whether I paid.
55. As a Customer who cancelled or whose payment failed, I want the Return page to say so instead of saying "thank you", so that I can try again.
56. As a Customer who pressed Back on the Checkout Session's hosted URL, I want the pay button to work again, so that I'm not stuck.
57. As a maintainer, I want the package hand-written with its own minimal types, so that there's no Fern pipeline to run and no coupling to `@transxact/node` releases.
58. As a maintainer, I want changesets-based versioning and CI that runs lint, typecheck, tests and build, then publishes to npm with provenance, so that releases are routine and verifiable.
59. As a maintainer, I want the domain vocabulary (Checkout Session status, Merchant backend, Checkout attempt, Return page) used consistently in code, docs and errors, so that the SDK reads like the platform.

## Implementation Decisions

**Modules** (all in this repo; nothing outside it changes):
- **Types**: the Checkout Session status union; a minimal `CheckoutSessionLike` (`id` and status); the result of a create (`hostedUrl`); the context a create receives (`idempotencyKey`, `signal`); the signatures of the create and retrieve functions; polling options.
- **Errors**: one SDK error class with a `code` from `config_missing | http_error | invalid_response | missing_session_id`. It carries the HTTP `status` and parsed `body` for `http_error`. Anything else the Merchant's function throws is passed through (non-Error values are wrapped).
- **Merchant backend transport**: a small JSON request helper used only by the URL shorthands. It merges the Merchant's fetch options, sends JSON, parses JSON, and turns non-2xx responses into `http_error` and unparsable bodies into `invalid_response`.
- **Configuration**: the optional provider and a merge that gives precedence to hook/button props over the provider. A function beats a URL at the same level, and a prop-level URL beats a provider-level function.
- **`useCheckout`**: holds the Checkout attempt.
- **Checkout button**: a thin, ref-forwarding wrapper over `useCheckout`.
- **`useCheckoutReturn`**: resolves the session id, retrieves, and polls.

**Checkout attempt behaviour (`useCheckout`)**
- State machine: `idle → creating → redirecting`. Any failure while creating goes to `error`. `reset` returns to `idle`.
- `start` does nothing while `creating` or `redirecting`.
- The Idempotency-Key is made lazily on the first `start` of an attempt. It survives `error` → `start` retries and is cleared by `reset`, by unmount, and by a page restored from the back/forward cache. With the URL shorthand, a retry whose create URL or payload differs from the attempt's is a new Checkout attempt and gets a new key (the SDK can't see what a Merchant-supplied function sends, so there the Merchant calls `reset`).
- Keys use `crypto.randomUUID` when it's available, falling back to a v4 UUID built from `crypto.getRandomValues`.
- `hostedUrl` is validated before navigation. It must parse as a URL with `https:`; `http:` is allowed only for localhost/loopback hosts. Anything else is `invalid_response`.
- The default redirect is a full-page `location.assign`; a `redirect` option overrides it. After redirecting, the hook stays in `redirecting`.
- An AbortSignal is passed to the create function and aborted on unmount and on `reset`. An aborted attempt never sets state.

**URL shorthand contract (the wire contract Merchant backends implement)**
- **Create**: `POST <createSessionUrl>` with header `Content-Type: application/json`, header `Idempotency-Key: <key>`, and the Merchant's payload as the JSON body (an empty object when there's no payload). It expects a 2xx JSON response with a string `hostedUrl`; other fields are ignored.
- **Retrieve**: `GET <url>`. With a string URL, the SDK sets the `session_id` query parameter. With a function, it calls the function with the id. It expects a 2xx JSON response with a valid Checkout Session status; other fields are passed through as the typed session.

**Return page behaviour (`useCheckoutReturn`)**
- **State machine:** `idle` (server render and first client render) → `missing` (no id), or `loading`. Then, depending on the response:
  - `settled` when the Checkout Session status is final;
  - `polling` while it's `pending`, then `settled` or `timed_out`;
  - `error` at any point.
- **Session id:** the id comes from an explicit option, otherwise from the `session_id` query parameter. It's read inside an effect, never during render.
- **Polling:** capped exponential backoff, with defaults of a 1.5 s first interval, doubling to an 8 s cap, and a 60 s total timeout. The timeout is measured from the first request.
- **Cancellation:** each run has its own AbortController, aborted on unmount, on id change and on `refresh`.
- **What a response must contain:** it's accepted when it's an object whose status is one of the four values. The SDK doesn't compare `id` with the requested id.
- **Types:** the hook is generic over the Merchant's session type, which is bounded by `CheckoutSessionLike`.

**Packaging**
- Name `@transxact/react`; peer dependency `react >=18`; `react-dom` isn't needed at runtime.
- ESM + CJS + declaration files, `sideEffects: false`, and a `"use client"` banner on every output file.
- Built with tsdown; lint and format with Biome; releases with changesets and GitHub Actions using npm OIDC trusted publishing with provenance.

**Documentation**
- README quickstart: provider + button, the Return page, and a Next.js App Router Merchant backend built on `@transxact/node` 0.2.x as it is today. That means passing `Authorization: Bearer sk_…` by hand, a required `environment`, and `postV1CheckoutSessions` / `getV1CheckoutSessionsId`, with the Idempotency-Key forwarded.
- The README also covers the URL shorthand contract and why the Return page is only a hint.
- The architectural decision is recorded as ADR-0001. The vocabulary is the repo's domain glossary.

## Testing Decisions

- **What a good test is:** it drives the package only through its public exports, the way a Merchant would, and checks only what a Merchant can see:
  - rendered output and hook return values;
  - requests that reach the faked Merchant backend (URL, method, headers, body);
  - redirect calls.
  Tests never import internal modules and never check internal calls, refs or render counts.
- **Seam 1: the public API, rendered with React Testing Library in jsdom.** This covers almost everything:
  - both handoff forms;
  - provider-vs-props precedence;
  - the no-amount guarantee (the button/hook props have no amount, and the POST body is exactly the payload);
  - idempotency-key reuse across retries and renewal on reset;
  - double-submit guard, busy/disabled attributes, and `preventDefault` in `onClick`;
  - `hostedUrl` validation;
  - back/forward-cache reset;
  - abort on unmount;
  - Return page: `missing`, pending→succeeded polling, the `timed_out` state, invalid responses, `refresh`, and `state` and `session.status` reported independently (e.g. an `http_error` while the session is unknown, versus `settled` with status `failed`).

  The Merchant backend is faked with stub functions, or a stubbed global `fetch` for the shorthands. Navigation goes through the `redirect` option and `history`/`location` for `session_id`. Time uses vitest fake timers.
- **Seam 2: type tests.** `@transxact/node`'s `CheckoutSession` (a dev dependency) is assignable to `CheckoutSessionLike`, and the Return page hook's generic returns the Merchant's own session type.
- **Seam 3: server rendering.** `renderToString` of the provider, button and a component using the Return page hook runs in a non-DOM environment without throwing, and renders the `idle` output.
- **Prior art:** none in this repo yet. The closest are the vitest suites in `mpaisa-js` (behaviour-first tests of a hand-written SDK) and the msw wire tests in `transxact-node`, which check request shape at the HTTP boundary. Here a stubbed `fetch` plays msw's role, to keep dev dependencies small.
- **Build check:** a dry-run pack confirms the exports map, the `"use client"` banner, the type declarations for both formats, and that no test files ship.

## Out of Scope

- **Server-side helpers:** route handlers, server actions, webhook verification, and any code holding a secret key.
- **An embedded, modal or iframe checkout,** and any postMessage protocol.
- **A headless wallet UI** (choosing a Provider, MyCash OTP entry) or any direct call to Transxact from the browser.
- **React Native** and any in-app-browser handling.
- **Styled or branded components,** CSS, and Provider logos. Also `asChild`/slot composition.
- **Changes to any other repo:**
  - the platform (e.g. adding bearer `securitySchemes` to the OpenAPI spec, publishable keys, CORS);
  - `@transxact/node` (exporting `verifyWebhookSignature`, making `environment` optional, grouping methods by resource, retrying network errors).

  These are follow-ups for their owners.
- **Cancelling a Checkout Session from the browser.**

## Further Notes

- Test mode only is live today (Live mode is gated per Provider), so end-to-end checks use an `sk_test_` key on a Merchant backend. The Test mode transition endpoint can drive a Checkout Session to a final status without a real Wallet.
- If the platform later adds a client-safe key or an embeddable checkout, those arrive as additions next to the current API; nothing in v1 has to break (ADR-0001).
- `@transxact/node` 0.2.33, the latest at the time of writing, still has the gaps listed under Out of Scope, so the README's Merchant backend example must match that version and be revised when the gaps close.
