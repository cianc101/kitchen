CREATE TABLE IF NOT EXISTS receipt_imports (
  id TEXT PRIMARY KEY,
  retailer TEXT NOT NULL DEFAULT '',
  purchased_on TEXT,
  total_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'review',
  source_name TEXT NOT NULL DEFAULT '',
  raw_result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipt_imports_status ON receipt_imports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL DEFAULT '',
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  line_total_cents INTEGER,
  category TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  destination TEXT NOT NULL DEFAULT 'pantry',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(receipt_id) REFERENCES receipt_imports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id, review_status);

CREATE TABLE IF NOT EXISTS product_mappings (
  id TEXT PRIMARY KEY,
  retailer TEXT NOT NULL DEFAULT '',
  raw_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  default_unit TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT 'pantry',
  confirmations INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(retailer, raw_name)
);
CREATE INDEX IF NOT EXISTS idx_product_mappings_lookup ON product_mappings(retailer, raw_name);
