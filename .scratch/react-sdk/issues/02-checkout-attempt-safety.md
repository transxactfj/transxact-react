# 02: Checkout attempt safety — Idempotency-Key, double-submit guard, abort, back/forward cache

**What to build:** Make a Checkout attempt safe to click and retry. The SDK generates one Idempotency-Key per Checkout attempt and hands it to the Merchant's `createSession`, so the Merchant backend can forward it to Transxact. A double-click, or a retry after a lost response, then never creates a second Checkout Session. Repeated clicks are ignored while one is in flight. Work in flight is aborted when it no longer matters. A Customer coming back from the hosted URL with the browser's Back button finds a working button. See the spec's "Checkout attempt behaviour" decision and ADR-0001.

**Blocked by:** 01 — Tracer bullet: pay button redirects via a Merchant-supplied function

**Status:** done

- [x] `createSession` receives `{ idempotencyKey, signal }`. The key is a UUID made lazily on the first `start` of a Checkout attempt: `crypto.randomUUID` when available, otherwise a v4 UUID built from `crypto.getRandomValues`.
- [x] After an error, calling `start` again passes the **same** Idempotency-Key.
- [x] After `reset`, or after the component remounts, the next `start` passes a **new** Idempotency-Key.
- [x] `start` does nothing while `state` is `creating` or `redirecting`. Two rapid clicks call the Merchant function once.
- [x] The signal passed to `createSession` is aborted on unmount and on `reset`. An aborted attempt never updates state and never redirects.
- [x] When the page is restored from the back/forward cache (`pageshow` with `persisted`), the hook returns to `idle` with a fresh Idempotency-Key, so the button isn't stuck in `redirecting`.
- [x] `CheckoutButton` runs the Merchant's own `onClick` first and doesn't start a Checkout attempt if that handler called `preventDefault`.
- [x] `CheckoutButton` is `disabled` and `aria-busy` while `creating` or `redirecting`. A Merchant-supplied `disabled` still disables it at other times.
- [x] Every behaviour above is covered by tests through the public API.
