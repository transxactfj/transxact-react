# Transxact React

The browser side of a Transxact integration: starting a Checkout Session from a Merchant's React app and landing the Customer back on it. Platform terms (Merchant, Customer, Provider, Wallet, Checkout Session, Test mode / Live mode) are defined in the platform glossary, [`transxact/CONTEXT.md`](https://github.com/transxactfj/transxact/blob/main/CONTEXT.md), and mean exactly the same here.

## Language

**Checkout Session status**:
The platform's status of a Checkout Session — pending, succeeded, failed or cancelled — and the only thing "status" ever refers to in this SDK.
_Avoid_: Status for the SDK's own loading or request progress (call that state), result, outcome.

**Merchant backend**:
The Merchant's own server, which holds the secret key and is the only party that creates or retrieves Checkout Sessions on the browser's behalf.
_Avoid_: API, server (both ambiguous with Transxact's API).

**Checkout attempt**:
One Customer intent to pay for one particular thing, from pressing pay until they are sent to the Checkout Session's hosted URL; retrying the same request after an error continues the attempt, while asking for something different (the Customer changed the cart) is a new one.
_Avoid_: Request, try.

**Return page**:
The Merchant page at a Checkout Session's success or cancel URL that the Customer lands on afterwards — a hint that the Checkout Session has moved on, never proof of its status.
_Avoid_: Success page, callback, confirmation page.
