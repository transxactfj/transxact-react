---
"@transxact/react": minor
---

First release of `@transxact/react`, the client-only React SDK for Transxact hosted Checkout Sessions.

- `useCheckout` and `<CheckoutButton>` start a Checkout attempt through the Merchant backend and send the Customer to the Checkout Session's hosted URL, with an Idempotency-Key per Checkout attempt, a double-submit guard and https-only `hostedUrl` validation.
- `useCheckoutReturn` confirms the Checkout Session status on the Return page through the Merchant backend, polling while it is `pending`.
- `<TransxactProvider>` holds shared settings; `createSessionUrl` / `retrieveSessionUrl` shorthands cover simple Merchant backends.
- Never takes an amount or a secret key.
