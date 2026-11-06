CREATE TABLE orders (
 id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 items TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL CHECK(currency='INR'),
 status TEXT NOT NULL DEFAULT 'creating', provider_order_id TEXT UNIQUE, payment_id TEXT UNIQUE,
 created_at TEXT NOT NULL, paid_at TEXT, UNIQUE(owner_hash,request_key)
);
CREATE TABLE stock (sku TEXT PRIMARY KEY, remaining INTEGER NOT NULL CHECK(remaining>=0));
INSERT INTO stock VALUES ('folio-a5-ink',20),('folio-a5-stone',20),('pen-brass',15),('pen-graphite',15),('tray-cloud',12),('tray-ink',12),('cards-ivory',30),('case-sand',10),('case-ink',10),('pad-weekly',25);
CREATE TABLE payment_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, payment_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX orders_owner ON orders(owner_hash,created_at);
