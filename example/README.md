# @transxact/react example

A small Next.js shop showing both legs of a payment with `@transxact/react`: a pay button (`CheckoutButton`) and a return page that confirms the result (`useCheckoutReturn`).

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Cart page with `TransxactProvider` and two pay buttons (one succeeds, one hits the 404 error path) |
| `app/checkout/return/page.tsx` | Return page using `useCheckoutReturn` |
| `app/api/checkout/route.ts` | Merchant backend: creates and retrieves Checkout Sessions with your secret key (server-only) |
| `app/api/webhooks/transxact/route.ts` | Verifies Transxact's signed webhooks; this is where a real shop marks orders paid |
| `app/fake-hosted/page.tsx` | Stand-in for the hosted checkout page, handy for poking at the return page |

## Run it

```bash
cd example
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

Use an `sk_test_` key. Test mode runs simulated payments on a Transxact practice screen and moves no money. The secret key stays on the server; the browser only ever sees a session id, a `hostedUrl` and a status.

Return links must be https and reachable by the Customer's browser, so set `PUBLIC_BASE_URL` to a tunnel URL (for example `cloudflared tunnel --url http://localhost:3000`). Point a webhook endpoint at `${PUBLIC_BASE_URL}/api/webhooks/transxact` and put its signing secret in `TRANSXACT_WEBHOOK_SECRET`.

`/fake-hosted` is a stand-in for the hosted page that links back to the return page with made-up session ids; it is only for poking at the page's states.

The example installs the published `@transxact/react`. To try local changes, run `npm run build && npm pack` in the repo root and install the tarball here.
