CREATE TABLE shop_limits (
 actor TEXT NOT NULL,
 scope TEXT NOT NULL,
 bucket INTEGER NOT NULL,
 used INTEGER NOT NULL,
 cap INTEGER NOT NULL,
 CONSTRAINT shop_limit_ceiling CHECK(used <= cap),
 PRIMARY KEY(actor,scope,bucket)
);
CREATE TABLE shop_sessions (
 owner_hash TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
INSERT INTO shop_sessions(owner_hash,expires_at)
 SELECT DISTINCT owner_hash, (CAST(strftime('%s','now') AS INTEGER)+1209600)*1000 FROM orders;
