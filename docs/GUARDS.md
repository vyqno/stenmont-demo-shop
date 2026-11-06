# Staging checkout admission

18:29 IST, 2026-11-06: local request guards verified with18tests and TypeScript. No build, deploy, push, provider call or browser rerun was performed for this follow-up.

`CHECKOUT_ENABLED=yes` is required to create Razorpay checkouts, in addition to staging/local environment and configured test keys. It defaults off. Adding the secrets alone does not enable checkout. The switch does not reject signed captured webhooks for existing orders: disabling new checkout must not lose payment receipts.

Migration `0002_shop_limits.sql` adds atomic counters and an issued-session registry. Only SHA256 digests of random cookie values and Cloudflare's connecting IP are stored. No raw IP or session cookie is persisted. Cookie lookup validates the issued-session registry; a syntactically valid invented cookie cannot bypass the session cap. Existing order-owner digests are migrated to retain their receipt access for14days.

New order ceilings use fixed UTC windows:

| Scope | Hour | Day |
|---|---:|---:|
| Owner |5|20|
| Connecting IP |10|30|
| Newly issued sessions per IP |5|20|

A new order, its four admission counters and stock reservation form one D1 transaction. A cap violation rolls all of them back. A repeated owned request key inserts no order and consumes no additional counter or stock. Provider creation still has its independent one-time claim. A new owner/cookie cannot bypass the IP ceiling. Production rejects checkout and sessions; staging requires Cloudflare's connecting-IP header. Local development uses a shared local bucket when that header is absent.

Tests use SQLite transactions behind the D1 batch interface, serialized as real D1 transactions are. They exercise simultaneous calls, owner isolation, IP rotation resistance, hourly/day resets, retained receipts, invented-cookie refusal and free retries. This is not a deployed multi-isolate load test.

These are application admission limits, not a network DDoS control. Counter/session retention cleanup and broad operational recovery remain future work. Uncertain provider sends still retain stock and require reconciliation; nothing expires or releases them blindly.
