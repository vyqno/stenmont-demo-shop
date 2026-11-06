ALTER TABLE orders RENAME TO orders_before_stenmont;
CREATE TABLE orders (
 id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 items TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL,
 rail TEXT NOT NULL DEFAULT 'razorpay',
 status TEXT NOT NULL DEFAULT 'creating', provider_order_id TEXT UNIQUE, payment_id TEXT UNIQUE,
 invoice_id TEXT UNIQUE, pay_url TEXT, merchant_id TEXT,
 created_at TEXT NOT NULL, paid_at TEXT,
 CHECK((rail='razorpay' AND currency='INR') OR (rail='stenmont' AND currency='USDT')),
 UNIQUE(owner_hash,request_key)
);
INSERT INTO orders(id,owner_hash,request_key,fingerprint,items,amount,currency,status,provider_order_id,payment_id,created_at,paid_at)
 SELECT id,owner_hash,request_key,fingerprint,items,amount,currency,status,provider_order_id,payment_id,created_at,paid_at FROM orders_before_stenmont;
DROP TABLE orders_before_stenmont;
CREATE INDEX orders_owner ON orders(owner_hash,created_at);
