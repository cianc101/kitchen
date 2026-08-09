const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const now = () => new Date().toISOString();
const text = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const num = value => value === '' || value == null ? null : Number(value);
const setupError = () => json({ ok: false, error: 'setup-required', message: 'Cloudflare D1 has not been connected to Kitchen yet.' }, 503);

async function body(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('Expected JSON request body');
  return request.json();
}

async function shopping(request, env) {
  if (!env.DB) return setupError();
  if (request.method === 'GET') {
    const result = await env.DB.prepare("SELECT * FROM shopping_items ORDER BY checked ASC, COALESCE(shop,''), created_at DESC").all();
    return json({ ok: true, items: result.results || [] });
  }
  if (request.method === 'POST') {
    const input = await body(request), name = text(input.name);
    if (!name) return json({ ok: false, message: 'Item name is required.' }, 400);
    const id = crypto.randomUUID(), stamp = now();
    await env.DB.prepare('INSERT INTO shopping_items (id,name,quantity,shop,category,checked,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)')
      .bind(id, name, text(input.quantity), text(input.shop), text(input.category), stamp, stamp).run();
    return json({ ok: true, id }, 201);
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shopping_items WHERE checked=1').run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function shoppingItem(request, env, id) {
  if (!env.DB) return setupError();
  const current = await env.DB.prepare('SELECT * FROM shopping_items WHERE id=?').bind(id).first();
  if (!current) return json({ ok: false, error: 'not-found' }, 404);
  if (request.method === 'PATCH') {
    const input = await body(request);
    await env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,shop=?,category=?,checked=?,updated_at=? WHERE id=?')
      .bind(text(input.name ?? current.name), text(input.quantity ?? current.quantity), text(input.shop ?? current.shop), text(input.category ?? current.category), input.checked == null ? Number(current.checked) : (input.checked ? 1 : 0), now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shopping_items WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function meals(request, env, url) {
  if (!env.DB) return setupError();
  if (request.method === 'GET') {
    const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get('to') || '9999-12-31';
    const result = await env.DB.prepare("SELECT * FROM meals WHERE meal_date BETWEEN ? AND ? ORDER BY meal_date, CASE meal_type WHEN 'Breakfast' THEN 0 WHEN 'Lunch' THEN 1 ELSE 2 END").bind(from, to).all();
    return json({ ok: true, meals: result.results || [] });
  }
  if (request.method === 'POST') {
    const input = await body(request), title = text(input.title);
    if (!title || !input.meal_date) return json({ ok: false, message: 'Meal and date are required.' }, 400);
    const id = crypto.randomUUID(), stamp = now();
    await env.DB.prepare('INSERT INTO meals (id,meal_date,meal_type,title,recipe_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, input.meal_date, text(input.meal_type, 'Dinner') || 'Dinner', title, input.recipe_id || null, text(input.notes), stamp, stamp).run();
    return json({ ok: true, id }, 201);
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function mealById(request, env, id) {
  if (!env.DB) return setupError();
  const current = await env.DB.prepare('SELECT * FROM meals WHERE id=?').bind(id).first();
  if (!current) return json({ ok: false, error: 'not-found' }, 404);
  if (request.method === 'PATCH') {
    const input = await body(request);
    await env.DB.prepare('UPDATE meals SET meal_date=?,meal_type=?,title=?,recipe_id=?,notes=?,updated_at=? WHERE id=?')
      .bind(input.meal_date ?? current.meal_date, text(input.meal_type ?? current.meal_type, 'Dinner'), text(input.title ?? current.title), input.recipe_id === undefined ? current.recipe_id : (input.recipe_id || null), text(input.notes ?? current.notes), now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM meals WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function recipes(request, env, url) {
  if (!env.DB) return setupError();
  if (request.method === 'GET') {
    const q = text(url.searchParams.get('q')).toLowerCase();
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await env.DB.prepare('SELECT * FROM recipes WHERE LOWER(name) LIKE ? OR LOWER(ingredients) LIKE ? ORDER BY favourite DESC,name').bind(like, like).all();
    } else result = await env.DB.prepare('SELECT * FROM recipes ORDER BY favourite DESC,name').all();
    return json({ ok: true, recipes: result.results || [] });
  }
  if (request.method === 'POST') {
    const input = await body(request), name = text(input.name);
    if (!name) return json({ ok: false, message: 'Recipe name is required.' }, 400);
    const id = crypto.randomUUID(), stamp = now();
    await env.DB.prepare('INSERT INTO recipes (id,name,ingredients,instructions,source,favourite,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, name, text(input.ingredients), text(input.instructions), text(input.source), input.favourite ? 1 : 0, stamp, stamp).run();
    return json({ ok: true, id }, 201);
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function recipeById(request, env, id) {
  if (!env.DB) return setupError();
  const current = await env.DB.prepare('SELECT * FROM recipes WHERE id=?').bind(id).first();
  if (!current) return json({ ok: false, error: 'not-found' }, 404);
  if (request.method === 'GET') return json({ ok: true, recipe: current });
  if (request.method === 'PATCH') {
    const input = await body(request);
    await env.DB.prepare('UPDATE recipes SET name=?,ingredients=?,instructions=?,source=?,favourite=?,updated_at=? WHERE id=?')
      .bind(text(input.name ?? current.name), text(input.ingredients ?? current.ingredients), text(input.instructions ?? current.instructions), text(input.source ?? current.source), input.favourite == null ? Number(current.favourite) : (input.favourite ? 1 : 0), now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recipes WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function recipeToShopping(env, id) {
  const recipe = await env.DB.prepare('SELECT ingredients FROM recipes WHERE id=?').bind(id).first();
  if (!recipe) return json({ ok: false, error: 'not-found' }, 404);
  const lines = String(recipe.ingredients || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 60);
  const stamp = now();
  for (const line of lines) {
    await env.DB.prepare("INSERT INTO shopping_items (id,name,quantity,shop,category,checked,created_at,updated_at) VALUES (?,?,'','','Recipe',0,?,?)")
      .bind(crypto.randomUUID(), line, stamp, stamp).run();
  }
  return json({ ok: true, added: lines.length });
}

async function pantry(request, env) {
  if (!env.DB) return setupError();
  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT *, CASE WHEN low_stock_at IS NOT NULL AND quantity IS NOT NULL AND quantity <= low_stock_at THEN 1 ELSE 0 END AS low_stock FROM pantry_items ORDER BY low_stock DESC,name').all();
    return json({ ok: true, items: result.results || [] });
  }
  if (request.method === 'POST') {
    const input = await body(request), name = text(input.name);
    if (!name) return json({ ok: false, message: 'Pantry item name is required.' }, 400);
    const id = crypto.randomUUID(), stamp = now();
    await env.DB.prepare('INSERT INTO pantry_items (id,name,quantity,unit,location,low_stock_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, name, num(input.quantity), text(input.unit), text(input.location), num(input.low_stock_at), stamp, stamp).run();
    return json({ ok: true, id }, 201);
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function pantryById(request, env, id) {
  if (!env.DB) return setupError();
  const current = await env.DB.prepare('SELECT * FROM pantry_items WHERE id=?').bind(id).first();
  if (!current) return json({ ok: false, error: 'not-found' }, 404);
  if (request.method === 'PATCH') {
    const input = await body(request);
    await env.DB.prepare('UPDATE pantry_items SET name=?,quantity=?,unit=?,location=?,low_stock_at=?,updated_at=? WHERE id=?')
      .bind(text(input.name ?? current.name), input.quantity === undefined ? current.quantity : num(input.quantity), text(input.unit ?? current.unit), text(input.location ?? current.location), input.low_stock_at === undefined ? current.low_stock_at : num(input.low_stock_at), now(), id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM pantry_items WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function applyPantry(env, name, quantity, unit) {
  if (!name) return;
  const parsed = quantity == null ? 1 : Number(quantity);
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const existing = await env.DB.prepare('SELECT * FROM pantry_items WHERE LOWER(name)=LOWER(?) AND LOWER(unit)=LOWER(?) LIMIT 1').bind(name, unit || '').first();
  if (existing) {
    await env.DB.prepare('UPDATE pantry_items SET quantity=COALESCE(quantity,0)+?,updated_at=? WHERE id=?').bind(amount, now(), existing.id).run();
  } else {
    const stamp = now();
    await env.DB.prepare("INSERT INTO pantry_items (id,name,quantity,unit,location,low_stock_at,created_at,updated_at) VALUES (?,?,?,?, '',NULL,?,?)")
      .bind(crypto.randomUUID(), name, amount, unit || '', stamp, stamp).run();
  }
}

async function mappedProduct(env, retailer, rawName) {
  return env.DB.prepare('SELECT * FROM product_mappings WHERE LOWER(retailer)=LOWER(?) AND LOWER(raw_name)=LOWER(?) LIMIT 1').bind(retailer || '', rawName).first();
}

async function rememberMapping(env, retailer, rawName, name, category, unit, destination = 'pantry') {
  const stamp = now();
  const existing = await mappedProduct(env, retailer, rawName);
  if (existing) {
    await env.DB.prepare('UPDATE product_mappings SET canonical_name=?,category=?,default_unit=?,destination=?,confirmations=confirmations+1,last_used_at=?,updated_at=? WHERE id=?')
      .bind(name, category || '', unit || '', destination, stamp, stamp, existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO product_mappings (id,retailer,raw_name,canonical_name,category,default_unit,destination,confirmations,last_used_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)')
      .bind(crypto.randomUUID(), retailer || '', rawName, name, category || '', unit || '', destination, stamp, stamp, stamp).run();
  }
}

function titleCaseReceiptName(value) {
  const cleaned = value.replace(/^[*#\-\s]+|[*#\-\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return '';
  const letters = cleaned.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (letters.length && upper / letters.length > 0.7) {
    return cleaned.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bMl\b/g, 'ml').replace(/\bKg\b/g, 'kg');
  }
  return cleaned;
}

function inferCategory(name) {
  const value = name.toLowerCase();
  const groups = [
    ['Fruit & veg', ['apple','banana','orange','lemon','lime','berry','berries','grape','tomato','potato','onion','pepper','carrot','broccoli','lettuce','spinach','avocado','mushroom','cucumber','veg','salad']],
    ['Dairy', ['milk','cheese','yogurt','yoghurt','butter','cream','eggs','egg']],
    ['Meat & fish', ['chicken','beef','pork','lamb','turkey','bacon','ham','sausage','mince','steak','salmon','cod','fish','prawn','tuna']],
    ['Bakery', ['bread','roll','bagel','wrap','tortilla','croissant','bun']],
    ['Drinks', ['water','juice','cola','coke','lemonade','coffee','tea','drink','squash']],
    ['Frozen', ['frozen','ice cream','pizza']],
    ['Cupboard', ['pasta','rice','sauce','beans','tin','cereal','oats','flour','sugar','salt','oil','spice','noodle','soup','crisps','biscuit','chocolate']],
    ['Household', ['toilet','tissue','kitchen roll','detergent','cleaner','washing','dishwasher','foil','bag','soap','shampoo']]
  ];
  for (const [category, words] of groups) if (words.some(word => value.includes(word))) return category;
  return '';
}

function extractRetailer(lines) {
  const joined = lines.slice(0, 18).join(' ').toUpperCase();
  const retailers = [
    ['Aldi', /\bALDI\b/], ['Lidl', /\bLIDL\b/], ['Tesco', /\bTESCO\b/], ['Dunnes Stores', /\bDUNNES\b/],
    ['SuperValu', /\bSUPER\s*VALU\b/], ['Centra', /\bCENTRA\b/], ['Spar', /\bSPAR\b/], ['Marks & Spencer', /MARKS\s*(?:&|AND)\s*SPENCER|\bM&S\b/],
    ['Dealz', /\bDEALZ\b/], ['Fresh', /\bFRESH\b/]
  ];
  for (const [name, pattern] of retailers) if (pattern.test(joined)) return name;
  return '';
}

function extractDate(lines) {
  for (const line of lines) {
    const match = line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (!match) continue;
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const month = Number(match[2]), day = Number(match[1]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2100) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

function moneyToCents(value) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function extractTotal(lines) {
  for (const line of [...lines].reverse()) {
    if (!/\b(?:grand\s+total|total|amount\s+due)\b/i.test(line) || /sub\s*total/i.test(line)) continue;
    const match = line.match(/(?:€\s*)?(\d{1,5}[.,]\d{2})\s*[A-Za-z]?\s*$/);
    if (match) return moneyToCents(match[1]);
  }
  return null;
}

const NON_ITEM = /\b(?:subtotal|sub total|total|vat|tax|cash|change|card|visa|mastercard|debit|credit|contactless|balance|payment|receipt|transaction|trans no|auth|approval|cashier|operator|served by|loyalty|clubcard|points|saving|savings|discount|coupon|voucher|refund|deposit|bag charge|rounding|www\.|https?:|telephone|phone|store no|vat no|thank you|opening hours)\b/i;

function parseReceiptLine(line) {
  let cleaned = line.replace(/[|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned || cleaned.length < 4 || NON_ITEM.test(cleaned)) return null;
  const priceMatch = cleaned.match(/(?:€\s*)?(\d{1,5}[.,]\d{2})\s*[A-Za-z]?\s*$/);
  if (!priceMatch) return null;
  const lineTotalCents = moneyToCents(priceMatch[1]);
  cleaned = cleaned.slice(0, priceMatch.index).trim();
  if (!cleaned || !/[A-Za-z]{2}/.test(cleaned)) return null;
  cleaned = cleaned.replace(/^\d{5,}\s+/, '').replace(/\s+\d{5,}$/, '').trim();
  let quantity = 1;
  const qtyMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s+(.+)$/);
  if (qtyMatch) {
    quantity = Number(qtyMatch[1].replace(',', '.')) || 1;
    cleaned = qtyMatch[2].trim();
  }
  if (!cleaned || NON_ITEM.test(cleaned)) return null;
  const canonical = titleCaseReceiptName(cleaned);
  const words = canonical.split(/\s+/).filter(Boolean);
  const confidence = words.length >= 2 && canonical.length >= 7 ? 0.78 : 0.64;
  return { raw_name: cleaned, canonical_name: canonical, quantity, unit: '', line_total_cents: lineTotalCents, category: inferCategory(canonical), confidence };
}

async function scanReceipt(request, env) {
  if (!env.DB) return setupError();
  const input = await body(request);
  const rawText = text(input.raw_text).slice(0, 30000);
  if (!rawText || rawText.length < 10) return json({ ok: false, message: 'Kitchen could not read enough text from that receipt. Try a sharper, well-lit photo.' }, 400);
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 400);
  const retailer = text(input.retailer) || extractRetailer(lines);
  const purchasedOn = text(input.purchased_on) || extractDate(lines);
  const totalCents = input.total_cents == null ? extractTotal(lines) : Number(input.total_cents);
  const parsedLines = lines.map(parseReceiptLine).filter(Boolean).slice(0, 150);
  if (!parsedLines.length) return json({ ok: false, message: 'Kitchen found text, but could not confidently identify any purchase lines. Try a closer photo of the item section.' }, 400);

  const receiptId = crypto.randomUUID(), stamp = now();
  await env.DB.prepare("INSERT INTO receipt_imports (id,retailer,purchased_on,total_cents,currency,status,source_name,raw_result,created_at,updated_at) VALUES (?,?,?,?,?,'review',?,?,?,?)")
    .bind(receiptId, retailer, purchasedOn || null, Number.isFinite(totalCents) ? totalCents : null, 'EUR', text(input.source_name, 'receipt-photo'), rawText, stamp, stamp).run();

  let autoApplied = 0, pending = 0, ignored = 0;
  for (const found of parsedLines) {
    let canonical = found.canonical_name, category = found.category, unit = found.unit, confidence = found.confidence, destination = 'pantry';
    const mapping = await mappedProduct(env, retailer, found.raw_name);
    if (mapping) {
      canonical = mapping.canonical_name;
      category = mapping.category || category;
      unit = mapping.default_unit || unit;
      destination = mapping.destination || 'pantry';
      confidence = 1;
    }
    let reviewStatus = 'pending';
    if (destination === 'ignore') {
      reviewStatus = 'ignored';
      ignored++;
    } else if (mapping) {
      reviewStatus = 'auto';
      await applyPantry(env, canonical, found.quantity, unit);
      autoApplied++;
    } else pending++;

    await env.DB.prepare('INSERT INTO receipt_items (id,receipt_id,raw_name,canonical_name,quantity,unit,line_total_cents,category,confidence,review_status,destination,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), receiptId, found.raw_name, canonical, found.quantity, unit, found.line_total_cents, category, confidence, reviewStatus, destination, stamp, stamp).run();
  }
  if (!pending) await env.DB.prepare("UPDATE receipt_imports SET status='applied',updated_at=? WHERE id=?").bind(now(), receiptId).run();
  return json({ ok: true, id: receiptId, retailer, auto_applied: autoApplied, pending_review: pending, ignored, detected_lines: parsedLines.length }, 201);
}

async function listReceipts(env) {
  const result = await env.DB.prepare("SELECT r.*, (SELECT COUNT(*) FROM receipt_items i WHERE i.receipt_id=r.id AND i.review_status='pending') AS pending_count, (SELECT COUNT(*) FROM receipt_items i WHERE i.receipt_id=r.id) AS item_count FROM receipt_imports r ORDER BY created_at DESC LIMIT 50").all();
  return json({ ok: true, receipts: result.results || [] });
}

async function receiptById(request, env, id) {
  const receipt = await env.DB.prepare('SELECT * FROM receipt_imports WHERE id=?').bind(id).first();
  if (!receipt) return json({ ok: false, error: 'not-found' }, 404);
  if (request.method === 'GET') {
    const items = await env.DB.prepare('SELECT * FROM receipt_items WHERE receipt_id=? ORDER BY created_at').bind(id).all();
    return json({ ok: true, receipt, items: items.results || [] });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM receipt_items WHERE receipt_id=?').bind(id).run();
    await env.DB.prepare('DELETE FROM receipt_imports WHERE id=?').bind(id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'method-not-allowed' }, 405);
}

async function reviewReceiptItem(request, env, id) {
  const item = await env.DB.prepare('SELECT * FROM receipt_items WHERE id=?').bind(id).first();
  if (!item) return json({ ok: false, error: 'not-found' }, 404);
  const receipt = await env.DB.prepare('SELECT * FROM receipt_imports WHERE id=?').bind(item.receipt_id).first();
  const input = await body(request);
  if (input.action === 'ignore') {
    await env.DB.prepare("UPDATE receipt_items SET review_status='ignored',destination='ignore',updated_at=? WHERE id=?").bind(now(), id).run();
  } else if (input.action === 'confirm') {
    const name = text(input.canonical_name) || item.canonical_name || item.raw_name;
    const quantity = input.quantity === '' || input.quantity == null ? (item.quantity ?? 1) : Number(input.quantity);
    const unit = text(input.unit, item.unit || '');
    const category = text(input.category, item.category || '');
    await applyPantry(env, name, quantity, unit);
    await rememberMapping(env, receipt?.retailer || '', item.raw_name, name, category, unit, 'pantry');
    await env.DB.prepare("UPDATE receipt_items SET canonical_name=?,quantity=?,unit=?,category=?,confidence=1,review_status='confirmed',destination='pantry',updated_at=? WHERE id=?")
      .bind(name, Number.isFinite(quantity) ? quantity : 1, unit, category, now(), id).run();
  } else return json({ ok: false, message: 'Unknown review action.' }, 400);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM receipt_items WHERE receipt_id=? AND review_status='pending'").bind(item.receipt_id).first();
  if (!Number(pending?.count || 0)) await env.DB.prepare("UPDATE receipt_imports SET status='applied',updated_at=? WHERE id=?").bind(now(), item.receipt_id).run();
  return json({ ok: true });
}

async function dashboard(env) {
  if (!env.DB) return setupError();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  const [shoppingResult, mealResult, lowResult, recipeCount, pantryCount, reviewCount] = await Promise.all([
    env.DB.prepare('SELECT * FROM shopping_items WHERE checked=0 ORDER BY created_at DESC LIMIT 8').all(),
    env.DB.prepare('SELECT * FROM meals WHERE meal_date BETWEEN ? AND ? ORDER BY meal_date LIMIT 14').bind(today, horizon).all(),
    env.DB.prepare('SELECT * FROM pantry_items WHERE low_stock_at IS NOT NULL AND quantity IS NOT NULL AND quantity <= low_stock_at ORDER BY name LIMIT 8').all(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM recipes').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM pantry_items').first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM receipt_items WHERE review_status='pending'").first()
  ]);
  return json({
    ok: true,
    shopping: shoppingResult.results || [],
    meals: mealResult.results || [],
    low_stock: lowResult.results || [],
    recipe_count: Number(recipeCount?.count || 0),
    pantry_count: Number(pantryCount?.count || 0),
    review_count: Number(reviewCount?.count || 0)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (path === '/api/health') return json({ ok: true, db: Boolean(env.DB), receipt_ocr: 'browser-local' });
      if (path === '/api/dashboard' && request.method === 'GET') return dashboard(env);
      if (path === '/api/shopping') return shopping(request, env);
      if (path === '/api/meals') return meals(request, env, url);
      if (path === '/api/recipes') return recipes(request, env, url);
      if (path === '/api/pantry') return pantry(request, env);
      if (path === '/api/receipts/scan' && request.method === 'POST') return scanReceipt(request, env);
      if (path === '/api/receipts' && request.method === 'GET') return listReceipts(env);

      let match = path.match(/^\/api\/shopping\/([^/]+)$/);
      if (match) return shoppingItem(request, env, match[1]);
      match = path.match(/^\/api\/meals\/([^/]+)$/);
      if (match) return mealById(request, env, match[1]);
      match = path.match(/^\/api\/recipes\/([^/]+)\/shopping$/);
      if (match && request.method === 'POST') return recipeToShopping(env, match[1]);
      match = path.match(/^\/api\/recipes\/([^/]+)$/);
      if (match) return recipeById(request, env, match[1]);
      match = path.match(/^\/api\/pantry\/([^/]+)$/);
      if (match) return pantryById(request, env, match[1]);
      match = path.match(/^\/api\/receipts\/items\/([^/]+)$/);
      if (match && request.method === 'PATCH') return reviewReceiptItem(request, env, match[1]);
      match = path.match(/^\/api\/receipts\/([^/]+)$/);
      if (match) return receiptById(request, env, match[1]);

      return json({ ok: false, error: 'not-found' }, 404);
    } catch (error) {
      console.error(JSON.stringify({ app: 'kitchen', path, error: error instanceof Error ? error.message : String(error) }));
      return json({ ok: false, error: 'request-failed', message: error instanceof Error ? error.message : 'Request failed.' }, 500);
    }
  }
};
