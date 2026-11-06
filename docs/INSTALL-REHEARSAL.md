# Before → install → after

This is a staging-only script. It has not been run against Razorpay or Stenmont. Keep screenshots and short clips at real speed; the final ETHGlobal video must remain under4minutes with no speed-up. Setup and coding happen before recording, with honest before/after checkpoints.

## Gates and preparation

- Sir approves creating the public `stenmont-demo-shop` repo separately. Nobody pushes without his yes.
- Lead prepares only the staging Worker and D1; sir adds the three Razorpay **test** Secrets in Cloudflare. No secret values enter the terminal output, source or browser except the public key id required by Razorpay Checkout.
- Lead configures Razorpay test webhook delivery to `/api/webhooks/razorpay`, subscribed to `payment.captured`. Confirm capture settings. Do not create a Razorpay account for sir.
- Check the shop at1440and390, empty basket, selected variant, two-item basket, unavailable checkout and pending/paid order. Preserve the browser cookie: receipts are owned by it.
- Record the before-install commit (`fb927cb` or the final baseline before the install). The Stenmont adapter is deliberately absent here. Do not call a prewritten manual integration an agent install.

## Before: native merchant checkout

1. Open `/products/folio`, choose Stone and quantity2. Add to basket; total must be₹2,400. Show the INR currency and Test label.
2. Start Razorpay **test** checkout with only documented test credentials. No real card, account or funds.
3. Return to the order. An authorized callback alone must still show awaiting payment. Show the real captured webhook delivery, then refresh and show Paid. Record local order id, provider order id, payment id and delivery event id in private evidence; never credentials or browser cookies.
4. Replay the exact signed event through the provider's test delivery tooling. It must not create a second order or stock reservation. The order remains bound to the same provider id/amount/currency.

## Install: exactly the merchant Connect path

1. Create **one** isolated Fieldwork test business on `app-staging.stenmont.com` with the virtual authenticator, if one is not already usable. Save credentials privately; no screenshot of the one-time API key.
2. Open Dashboard → Connect and copy its actual coding-agent prompt for this shop's staging URL and source checkout. Give that prompt to a separate coding agent, with repo write access to this demo shop only.
3. Connect the agent to the real MCP endpoint via OAuth2.1PKCE, review requested scopes, consent and prove a read. Do not hand it an unrestricted API key. Keep the existing Razorpay path available.
4. The coding agent inspects this project's catalogue, server-priced order creation and webhook invariants; it installs Stenmont as an explicit separate checkout option. Retain the original amount/currency/order binding. Store only server credentials in Cloudflare Secrets.
5. Choose explicit merchant-approved **USDT test prices** for the Stenmont rail. They are a separate catalogue price list, not an invented INR exchange rate. Never relabel₹2,400 as2,400USDT or silently convert it.
6. Register the signed webhook through the normal merchant API, verify the domain with the provided DNS TXT, and run Connect checks. If the API lacks a needed idempotency or order binding, stop and fix it with tests before a payment.
7. No Shopify migration is relevant to this fresh standalone merchant: no Shopify store, admin token or import history exists. If real migration data is later provided, preview its importer report and obtain the required explicit commit confirmation; do not fabricate a Shopify login journey.

## After: payment, fulfilment and dashboard correlation

1. Open the same product/cart. Show the actual checkout diff and the new explicitly labelled USDT test price/rail. The server must persist the order-to-invoice binding before redirecting and keep one retry key per basket.
2. Use an **already-funded** payer wallet. Never call a faucet or fund a new wallet. Stop for sir if test funds are insufficient.
3. Pay through Stenmont. Open the successful explorer transaction. Returning via a success URL must not mark the order paid.
4. The signed, amount-bound and invoice-bound paid webhook marks exactly the saved order paid. Show its delivery, the order receipt and the matching merchant dashboard invoice/order correlation. A signature without invoice/amount/status binding is insufficient.
5. Show Connect4/4 from actual checks. Revoke the OAuth app and prove the agent's next read is denied. Preserve both before and after commits and evidence filenames.

## Evidence table to fill only after running

| Check | Actual result | Evidence |
|---|---|---|
| Razorpay test captured order | Not run | Needs test Secrets and webhook setup |
| Prompt delivered to coding agent | Not run | Needs staging shop and merchant session |
| OAuth PKCE and revoke | Not run | Real MCP Inspector/agent run required |
| DNS and Connect4/4 | Not run | Actual hostname TXT required |
| Stenmont checkout transaction | Not run | Already-funded payer only |
| Signed webhook → owned order paid | Not run | Real delivery required |
| Matching dashboard record | Not run | Actual order/invoice id correlation |

## Failure checks

An uncertain provider send remains `submitting` with reserved stock. The persisted checkout key and owned pending-order link must survive refresh; do not generate another checkout automatically, release stock blindly or mark it failed from a timeout alone. Operator provider reconciliation is required before reopening it. A foreign browser cannot read the receipt. A tampered webhook, wrong amount/currency/order, or unconfirmed payment never changes the paid state.
