# Fieldwork Connect installation

This coding agent received the actual merchant Connect prompt on2026-11-06 and read it completely, then fetched the deployed [agent index](https://app-staging.stenmont.com/llms.txt) and [full reference](https://app-staging.stenmont.com/llms-full.txt). The API's current invoice view and paid-event shape were checked against the implementation. This is local implementation evidence, not a claim that Connect4/4 has passed.

## Before and after

Baseline `876c24b` was a standalone Razorpay-only shop. `ec2f7f1` bound its staging database; `7053a30` added admission guards. Those commits and existing paid Razorpay rows remain intact.

The new Stenmont option posts to the existing server checkout route, uses a separate fictional USDT price book and redirects only after its returned invoice id is saved. Folio is1.00USDT per unit; INR remains₹1,200. Other independent test prices are pen1.80, tray0.95, index cards0.45, case1.60 and weekly pad0.65USDT. These are explicit alternative merchant prices, not an exchange rate.

A server-generated order UUID is the invoice creation Idempotency-Key. The saved cart key is owner-scoped and bound to its quote including rail, currency and prices. Changing rails with that same key conflicts; it cannot change an existing order's rail. Legacy Razorpay fingerprint replays remain accepted only for the unchanged INR quote. Migration0003 copies existing orders and adds rail/invoice fields without changing old receipts or their amounts.

Creation allows60seconds for chain confirmation. A saved invoice and pay URL are reused; an uncertain send remains submitting and never starts a replacement invoice automatically. Early paid webhooks return409 until the invoice binding exists. A403payments_paused response shows “Payments are temporarily unavailable” and stops checkout.

## Configuration, lead only

Apply `0003_stenmont_orders.sql` on the isolated demo staging database before deploying this code. Set `STENMONT_API_URL` to the staging API and `STENMONT_MERCHANT_ID` to the matching merchant id as non-secret Worker variables. Merchant ids must match m_ followed by lowercase hexadecimal; missing or malformed configuration fails closed. The API key, saved order merchant and signed webhook metadata must describe that configured merchant. Secret values belong only in Cloudflare Secrets: `STENMONT_API_KEY`, `STENMONT_WEBHOOK_SECRET`. The names-only `.env.example` contains no values; the copied prompt's general dotenv suggestion is overridden by the owner's Cloudflare-only rule.

`STENMONT_CHECKOUT_ENABLED=yes` explicitly enables the USDT option after review. It is separate from Razorpay's `CHECKOUT_ENABLED`; both default off. Production is refused. Disabling creation does not discard a legitimate signed paid webhook.

The lead can run `scripts/register-stenmont-webhook.ts --staging`, supplying a private JSON stdin pipe with `apiKey` and a saved `registrationKey` UUID. It registers only the staging endpoint and pipes its returned signing secret directly to `wrangler secret put STENMONT_WEBHOOK_SECRET --env staging`. Neither key nor secret is printed. A retry must use the same registration UUID. This script was exercised with injected fixtures only; this agent did not run its real registration command.

## Webhook boundary

The endpoint verifies the raw body with timestamped HMAC-SHA256 and constant-time Web Crypto verification. It accepts either valid v1 during rotation and refuses timestamps outside±300seconds. Invalid signatures return400. A signed site.test or other non-paid event returns200.

A paid event must be test mode and match the stored order rail, invoice id, merchant metadata, USDT currency, exact integer amount, full amountPaid and paid status. Metadata alone has no authority. The payment transaction hash must be present. One atomic update records the paid order and deduplicates the namespaced event id. A success URL cannot mark an order paid, and Razorpay cannot settle a Stenmont order. The receipt shows the saved invoice and an explorer link.

## Still required live

- Lead deploy, secret configuration and real webhook registration.
- Actual site reachability, DNS proof, signed site.test and a paid test order producing Connect4/4.
- Actual OAuth consent/revoke evidence with the merchant's connected agent.
- Existing funded payer only; no faucet or platform funding.
- Actual webhook-to-order and matching dashboard invoice proof, then the dashboard financing journey if appropriate.

No browser, provider request, wallet action, account creation, push or deploy was performed by this implementation agent. The lead is the sole live browser/deployer. The real proof table remains pending until those runs occur.
