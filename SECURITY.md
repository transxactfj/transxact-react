# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/transxactfj/transxact-react/security/advisories/new)
for this repository. Include the affected version, what you did, and what you saw.

## Supported versions

Only the latest published minor version of `@transxact/react` receives security fixes.

## Scope and design

`@transxact/react` runs in the browser and never handles Transxact secret keys. Anything that needs a secret key
(creating and retrieving Checkout Sessions) belongs on your Merchant backend, which the SDK calls through the URLs
or functions you provide. See `docs/adr/0001-client-only-react-sdk.md`.
