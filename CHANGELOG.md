# @transxact/react

## 0.1.0

### Minor Changes

- [`d9678d1`](https://github.com/transxactfj/transxact-react/commit/d9678d15ea96403a402c1a9e54069e17d24bb04b) Thanks [@phfj](https://github.com/phfj)! - First release of `@transxact/react`, the client-only React SDK for Transxact hosted Checkout Sessions.
  
  - `useCheckout` and `<CheckoutButton>` start a Checkout attempt through the Merchant backend and send the Customer to the Checkout Session's hosted URL, with an Idempotency-Key per Checkout attempt, a double-submit guard and https-only `hostedUrl` validation.
  - `useCheckoutReturn` confirms the Checkout Session status on the Return page through the Merchant backend, polling while it is `pending`.
  - `<TransxactProvider>` holds shared settings; `createSessionUrl` / `retrieveSessionUrl` shorthands cover simple Merchant backends.
  - Never takes an amount or a secret key.
