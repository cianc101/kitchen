CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopping_checked ON shopping_items(checked, created_at);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'Dinner',
  title TEXT NOT NULL,
  recipe_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(meal_date);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  favourite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);

CREATE TABLE IF NOT EXISTS pantry_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  low_stock_at REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pantry_name ON pantry_items(name);
