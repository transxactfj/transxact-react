# 04: Return page confirmation via a Merchant-supplied function

**What to build:** A Return page hook that tells the Merchant the real Checkout Session status. It reads `session_id`, asks the Merchant backend through the Merchant's own `retrieveSession` function, and polls with capped exponential backoff while the Checkout Session is `pending`. It reports its own progress as `state`, separately from the Checkout Session status, so a failed request is never confused with a failed payment. It never infers an outcome from the Return page URL. See the spec's "Return page behaviour" decision, ADR-0001, and the glossary entries for Return page and Checkout Session status.

**Blocked by:** 01 — Tracer bullet: pay button redirects via a Merchant-supplied function

**Status:** done

- [x] `useCheckoutReturn({ retrieveSession, sessionId?, polling? })` returns `state`, `session`, `error` and `refresh`, and is exported publicly.
- [x] `state` is one of `idle | loading | polling | settled | timed_out | error | missing`. The server render and the first client render are `idle`.
- [x] The session id comes from the `sessionId` option if given, otherwise from the `session_id` query parameter, read inside an effect and never during render. With no id, `state` becomes `missing` and nothing is fetched.
- [x] `retrieveSession(id, { signal })` is called. A response whose status is `succeeded`, `failed` or `cancelled` sets `session` and gives `settled`.
- [x] A `pending` response sets `session` and gives `polling`. Polling repeats with capped exponential backoff (defaults: 1.5 s first interval, doubling, capped at 8 s) until a final Checkout Session status, which gives `settled`.
- [x] If the Checkout Session is still `pending` when the timeout runs out (default 60 s, measured from the first request), `state` becomes `timed_out` and polling stops. All three polling values can be overridden with `polling`.
- [x] A response that isn't an object with one of the four valid statuses gives an error with code `invalid_response`, and `state` becomes `error`. Errors thrown by the Merchant function go through as in 01.
- [x] `refresh` restarts the lookup from `loading`, e.g. after `error` or `timed_out`.
- [x] In-flight requests and scheduled polls are aborted on unmount, on a change of session id, and on `refresh`. A stale response never updates state.
- [x] Tests cover `state` and `session.status` independently: a failed request while the session is unknown (`error`, no session) versus a completed lookup of a failed payment (`settled` with status `failed`).
- [x] The hook is generic over the Merchant's session type, bounded by `CheckoutSessionLike`, and returns that type without casting. A type test checks that `@transxact/node`'s `CheckoutSession` (a dev dependency) is assignable to `CheckoutSessionLike`.
- [x] Server rendering of a component using the hook doesn't throw and renders the `idle` output.
- [x] Polling tests use fake timers. The Merchant function is a stub. `session_id` is set through the URL in jsdom.
