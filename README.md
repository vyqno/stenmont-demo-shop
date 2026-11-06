# Fieldwork demo shop

A separate, realistic stationery merchant for the Stenmont staging installation demo. Six fictional products, ten variants, original vector scenes, a persistent basket, server-priced INR checkout, stock reservations and private order receipts.

**Test mode only. Nothing ships. No real payments or Stenmont installation have been demonstrated yet.**

## Run and verify

Requires Node26 and pnpm12.16.1. `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`, then `pnpm dev`. Product/cart UI works without payment credentials. Checkout reports unavailable until the staging bindings and secrets are configured. There are no secret values in a dotenv example: credentials belong only in Cloudflare Secrets.

The initial dependency commit contains the generated pnpm lockfile alongside the dependency manifest; implementation changes are separate small commits. The application was written for this hackathon, with third-party framework libraries listed in NOTICE.

## Staging configuration (lead only)

Proposed hostname: `demo-shop-staging.stenmont.com`. Proposed Worker: `stenmont-demo-shop-staging`. The config has no production environment and disables workers.dev. The all-zero D1 id is deliberately undeployable until the lead creates a **staging-only** D1 database and records its public database id.

1. Create the staging D1 database `stenmont-demo-shop-staging`, update only `env.staging.d1_databases[0].database_id`, and apply migrations including `0001_shop.sql` and `0002_shop_limits.sql` using `wrangler d1 migrations apply DB --remote --env staging`.
2. Prepare the Worker, then sir configures `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` using Cloudflare Secrets. Never place values in chat, source, `.env`, logs or command arguments. Only test-mode keys are accepted. The Checkout widget necessarily receives the **public key id**, never the key secret or webhook secret.
3. Build the adapter with `pnpm build:cf`; deploy only with explicit `--env staging`. Tell sir before deploying. The public GitHub repo `stenmont-demo-shop` requires sir's separate approval; no remote exists here.
4. In Razorpay's test configuration, set `https://demo-shop-staging.stenmont.com/api/webhooks/razorpay` for `payment.captured`, with its separately configured webhook secret. Confirm automatic capture in test settings. An authorized but uncaptured payment is deliberately not treated as paid.

Cloudflare's current docs recommend vinext (beta) for new projects. This application uses the same OpenNext1.20.16 path already exercised by Stenmont to keep the demo on the known Next16 adapter; the alternative and compatibility limitation must be reviewed before broad deployment.

## Order and payment rules

- Prices and variant availability come from the server catalogue. INR prices are in paise; no USDT/INR exchange rate is invented.
- An opaque HttpOnly/Secure/SameSite cookie owns an order; only its SHA256 digest is stored. A public order id alone grants no receipt access. Clearing cookies loses this demo receipt access; no account recovery is promised.
- A persisted browser checkout key is bound to the server basket fingerprint and owner. D1 atomically reserves stock once. Changed-basket retries conflict. A provider request is claimed once; an uncertain send remains pending and is **not automatically repeated**.
- Only a raw-body HMAC-valid `payment.captured` webhook with the stored provider order id, exact integer amount and INR currency can mark the order paid. Callback navigation and query parameters have no authority. Event replay is idempotent; a second payment id cannot replace the first.
- A browser-only order list is a convenience, not authentication. No addresses, phone numbers or real customer emails are collected.

## Known limits

Local browser verification covered catalogue, variant selection and basket at1440and390; six screenshots were viewed. No live Razorpay call, real webhook delivery, Cloudflare deployment, external account/repo creation, Shopify migration or Connect/OAuth install is claimed. Pending stock is retained conservatively after an uncertain provider send; an operator recovery/expiry workflow is required before broad use. New checkout creation is off until CHECKOUT_ENABLED=yes; setting credentials alone never opens it. Atomic owner/IP order caps and IP session caps are documented in docs/GUARDS.md. Signed webhook delivery is not subjected to these checkout caps. Product stock is seeded demo stock, not a warehouse integration. No real shipping, fulfilment, refund system or production mode exists.

## Primary references checked 2026-11-06

- [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/): server order creation, subunit amounts, test mode and captured-payment requirement.
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/): raw request body HMAC-SHA256, `X-Razorpay-Signature`, duplicate `x-razorpay-event-id`.
- [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/): current vinext recommendation and separate OpenNext path.

See [docs/INSTALL-REHEARSAL.md](docs/INSTALL-REHEARSAL.md) for the screen-ready before/after sequence. It is a script to run, not evidence that it ran.
