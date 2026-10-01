# 06: README quickstart and release pipeline

**What to build:** Make the package usable and releasable. A Merchant can finish a full integration from the README alone: their Merchant backend creates and retrieves Checkout Sessions, the pay button starts a Checkout attempt, and the Return page confirms the Checkout Session status. A maintainer can release by merging a changeset, with npm publishing done by CI using provenance. See the spec's "Documentation" and "Packaging" decisions and its Further Notes about `@transxact/node`'s current gaps.

**Blocked by:** 03 — `createSessionUrl` shorthand and `<TransxactProvider>`; 05 — `retrieveSessionUrl` shorthand and provider-level Return page defaults

**Status:** done

- [x] The README covers:
  - install;
  - the provider and button;
  - the function form of both handoffs;
  - a Return page component that renders from `state` and `session.status`;
  - a complete Next.js App Router Merchant backend (create and retrieve routes).
- [x] The Merchant backend example works against `@transxact/node` 0.4.37 (originally written for 0.2.x):
  - the secret key passed as `token`;
  - `environment` left to its production default;
  - `checkoutSessions.create` with the forwarded Idempotency-Key;
  - `checkoutSessions.retrieve`;
  - the secret key read from a server-only environment variable.
- [x] The README documents the URL shorthand wire contract: create request and response, retrieve request and response, and the error codes.
- [x] The README states that the Return page is a hint: Transxact appends `session_id` to both success and cancel URLs, and fulfilment must rely on webhooks or a server-side lookup, never the redirect.
- [x] The README states the package is client-only and never takes an amount or a secret key, and explains how to drive a Test mode Checkout Session to a final status for end-to-end testing.
- [x] Changesets is configured for this repo, and an initial changeset introduces the v0.1.0 public API.
- [x] A release workflow runs the `ci` script, then versions and publishes through changesets, using npm OIDC trusted publishing with provenance.
- [x] A `npm pack --dry-run` check confirms the published files are only the build output, README and LICENSE, and that the exports map, the `"use client"` banner, and the type declarations for both formats are present.
