---
"@transxact/react": minor
---

Harden requests to the Merchant backend. URL-shorthand requests now time out (`requestTimeoutMs`, default 30 s) with a new `timeout` error code, and errors no longer include the request's query string or host. `http_error` exposes `apiCode` from `{ error: { code } }` bodies. The Return page rejects a Checkout Session whose `id` differs from the one asked for, and retries transient failures (timeout, network error, HTTP 429/5xx) up to `polling.retries` (default 3) times. `TransxactProvider` gains `allowedHostedUrlHosts` to restrict where the Customer may be sent. The unused `missing_session_id` error code is removed.
