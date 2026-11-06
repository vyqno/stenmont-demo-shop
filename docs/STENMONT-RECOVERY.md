# Held invoice reconciliation

A provider request can fail before its result is bound to a local order. Do not create a replacement order, change the saved UUID or edit database rows. The invoice may already exist.

The owned-order route `POST /api/orders/<id>/reconcile` accepts only `{ "invoiceId": "<existing invoice id>" }`, from the shop's own origin and the original issued owner session. It makes a **GET only** to the configured staging API. The returned invoice must match the saved order id, configured merchant, USDT amount in integer units, accepted invoice status and exact shop return/pay URLs. A held, still-unbound order is bound using the store's existing compare-and-set code. This does not mark it paid; the signed paid webhook remains required.

A successful response returns the same order id, invoice id, payUrl and `awaiting_payment`. Open that saved payUrl only after verifying the order GET has the same binding. If the provider says the invoice is already paid, wait for its legitimate signed webhook retry; reconciliation does not bypass that proof.

Outbound fetch is wrapped so the Worker global remains its native receiver. A native-like receiver test failed before this wrapper and passed afterward. Live confirmation is still needed before assigning that as the cause of a particular deployment failure. Cloudflare documents that Custom Domains permit same-zone Worker fetch; this shop already uses `global_fetch_strictly_public`, so route changes are not justified without evidence.

Failure responses include sanitized diagnostics: API boundary stage, HTTP status and an allowlisted API code, or a fixed exception category. They never include credentials, request/response bodies, full signatures or raw exception text. Unknown sends remain held. If lookup fails, inspect those safe fields; do not repeat invoice creation.

Local verification:36tests and TypeScript passed. No new browser, provider call, deploy or push was performed by the implementation agent for this change.
