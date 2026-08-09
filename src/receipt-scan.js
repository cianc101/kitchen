const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const now = () => new Date().toISOString();
const text = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;

const NON_ITEM = /\b(?:subtotal|sub total|total|vat|tax|cash|change|card|visa|mastercard|debit|credit|contactless|balance|payment|receipt|transaction|trans no|auth|approval|cashier|operator|served by|loyalty|clubcard|points|saving|savings|discount|coupon|voucher|refund|deposit|bag charge|rounding|www\.|https?:|telephone|phone|store no|vat no|thank you|opening hours)\b/i;

const ABBREVIATIONS = new Map([
  ['chkn', 'Chicken'], ['chk', 'Chicken'], ['brst', 'Breast'], ['brsts', 'Breasts'], ['fil', 'Fillet'], ['flt', 'Fillet'], ['flts', 'Fillets'],
  ['bnls', 'Boneless'], ['sknls', 'Skinless'], ['mlk', 'Milk'], ['yog', 'Yogurt'], ['yogh', 'Yogurt'], ['org', 'Organic'],
  ['wht', 'White'], ['brn', 'Brown'], ['brd', 'Bread'], ['bcn', 'Bacon'], ['saus', 'Sausages'], ['mush', 'Mushrooms'],
  ['tom', 'Tomato'], ['toms', 'Tomatoes'], ['pot', 'Potato'], ['pots', 'Potatoes'], ['veg', 'Veg'], ['frz', 'Frozen'],
]);

function moneyToCents(value) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function titleCase(value) {
  const cleaned = value.replace(/^[*#\-\s]+|[*#\-\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) return '';
  const letters = cleaned.replace(/[^A-Za-z]/g, '');
  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  if (letters.length && uppercase / letters.length > 0.65) return cleaned.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  return cleaned.replace(/\b[a-z]/g, c => c.toUpperCase());
}

function canonicalProductName(value) {
  let cleaned = value
    .replace(/^\d{5,}\s+/, '')
    .replace(/\s+\d{5,}$/, '')
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|ml|cl|l)\b/ig, ' ')
    .replace(/\b(?:x\s*)?\d+\s?(?:pk|pack)\b/ig, ' ')
    .replace(/\bx\s*\d+\b/ig, ' ')
    .replace(/[_|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  cleaned = cleaned.split(/\s+/).map(word => ABBREVIATIONS.get(word.toLowerCase()) || word).join(' ');
  return titleCase(cleaned);
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
    ['Household', ['toilet','tissue','kitchen roll','detergent','cleaner','washing','dishwasher','foil','bag','soap','shampoo']],
  ];
  for (const [category, words] of groups) if (words.some(word => value.includes(word))) return category;
  return '';
}

function extractRetailer(lines) {
  const joined = lines.slice(0, 18).join(' ').toUpperCase();
  const retailers = [
    ['Aldi', /\bALDI\b/], ['Lidl', /\bLIDL\b/], ['Tesco', /\bTESCO\b/], ['Dunnes Stores', /\bDUNNES\b/],
    ['SuperValu', /\bSUPER\s*VALU\b/], ['Centra', /\bCENTRA\b/], ['Spar', /\bSPAR\b/], ['Marks & Spencer', /MARKS\s*(?:&|AND)\s*SPENCER|\bM&S\b/],
    ['Dealz', /\bDEALZ\b/], ['Fresh', /\bFRESH\b/],
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
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2100) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function extractTotal(lines) {
  for (const line of [...lines].reverse()) {
    if (!/\b(?:grand\s+total|total|amount\s+due)\b/i.test(line) || /sub\s*total/i.test(line)) continue;
    const match = line.match(/(?:€\s*)?(\d{1,5}[.,]\d{2})\s*[A-Za-z]?\s*$/);
    if (match) return moneyToCents(match[1]);
  }
  return null;
}

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
  const canonical = canonicalProductName(cleaned);
  if (!canonical || canonical.length < 3) return null;
  const letters = canonical.replace(/[^A-Za-z]/g, '');
  const words = canonical.split(/\s+/).filter(Boolean);
  const letterRatio = letters.length / Math.max(1, canonical.length);
  const confidence = Math.min(0.96, 0.55 + (letters.length >= 5 ? 0.14 : 0) + (words.length >= 2 ? 0.12 : 0) + (letterRatio >= 0.7 ? 0.10 : 0));
  return { raw_name: cleaned, canonical_name: canonical, quantity, unit: '', line_total_cents: lineTotalCents, category: inferCategory(canonical), confidence };
}

function normalize(value) {
  return String(value || '').toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|ml|cl|l|pk|pack)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function similarity(a, b) {
  const left = normalize(a), right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (Math.min(left.length, right.length) >= 6 && (left.includes(right) || right.includes(left))) return 0.92;
  const aa = new Set(left.split(' ')), bb = new Set(right.split(' '));
  const intersection = [...aa].filter(token => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

async function bestMapping(env, retailer, rawName) {
  const result = await env.DB.prepare("SELECT * FROM product_mappings WHERE LOWER(retailer)=LOWER(?) OR retailer='' ORDER BY confirmations DESC, last_used_at DESC LIMIT 500")
    .bind(retailer || '').all();
  let best = null, score = 0;
  for (const mapping of result.results || []) {
    const candidate = Math.max(similarity(rawName, mapping.raw_name), similarity(canonicalProductName(rawName), mapping.canonical_name));
    if (candidate > score) { best = mapping; score = candidate; }
  }
  return score >= 0.72 ? { mapping: best, score } : null;
}

async function rememberMapping(env, retailer, rawName, name, category, unit, destination = 'pantry') {
  const stamp = now();
  const existing = await env.DB.prepare('SELECT * FROM product_mappings WHERE LOWER(retailer)=LOWER(?) AND LOWER(raw_name)=LOWER(?) LIMIT 1').bind(retailer || '', rawName).first();
  if (existing) {
    await env.DB.prepare('UPDATE product_mappings SET canonical_name=?,category=?,default_unit=?,destination=?,confirmations=confirmations+1,last_used_at=?,updated_at=? WHERE id=?')
      .bind(name, category || '', unit || '', destination, stamp, stamp, existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO product_mappings (id,retailer,raw_name,canonical_name,category,default_unit,destination,confirmations,last_used_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)')
      .bind(crypto.randomUUID(), retailer || '', rawName, name, category || '', unit || '', destination, stamp, stamp, stamp).run();
  }
}

async function applyPantry(env, name, quantity, unit) {
  const amount = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
  const existing = await env.DB.prepare('SELECT * FROM pantry_items WHERE LOWER(name)=LOWER(?) AND LOWER(unit)=LOWER(?) LIMIT 1').bind(name, unit || '').first();
  if (existing) {
    await env.DB.prepare('UPDATE pantry_items SET quantity=COALESCE(quantity,0)+?,updated_at=? WHERE id=?').bind(amount, now(), existing.id).run();
  } else {
    const stamp = now();
    await env.DB.prepare("INSERT INTO pantry_items (id,name,quantity,unit,location,low_stock_at,created_at,updated_at) VALUES (?,?,?,?, '',NULL,?,?)")
      .bind(crypto.randomUUID(), name, amount, unit || '', stamp, stamp).run();
  }
}

function safeFirstTimeAuto(found) {
  if (found.category) return true;
  const normalized = normalize(found.canonical_name);
  const letters = normalized.replace(/[^a-z]/g, '');
  const tokens = normalized.split(' ').filter(Boolean);
  if (letters.length < 6) return false;
  if (found.confidence < 0.80) return false;
  if (tokens.some(token => /^\d+$/.test(token))) return false;
  return true;
}

export async function enhancedReceiptScan(request, env) {
  if (!env.DB) return json({ ok: false, error: 'setup-required', message: 'Cloudflare D1 has not been connected to Kitchen yet.' }, 503);
  const input = await request.json();
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
    let canonical = found.canonical_name, category = found.category, unit = found.unit, destination = 'pantry', confidence = found.confidence;
    const match = await bestMapping(env, retailer, found.raw_name);
    if (match?.mapping) {
      canonical = match.mapping.canonical_name;
      category = match.mapping.category || category;
      unit = match.mapping.default_unit || unit;
      destination = match.mapping.destination || 'pantry';
      confidence = Math.max(confidence, match.score);
    }

    let reviewStatus = 'pending';
    if (destination === 'ignore') {
      reviewStatus = 'ignored';
      ignored++;
    } else if (match?.mapping || safeFirstTimeAuto(found)) {
      reviewStatus = 'auto';
      await applyPantry(env, canonical, found.quantity, unit);
      autoApplied++;
      if (!match?.mapping) await rememberMapping(env, retailer, found.raw_name, canonical, category, unit, 'pantry');
    } else {
      pending++;
    }

    await env.DB.prepare('INSERT INTO receipt_items (id,receipt_id,raw_name,canonical_name,quantity,unit,line_total_cents,category,confidence,review_status,destination,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), receiptId, found.raw_name, canonical, found.quantity, unit, found.line_total_cents, category, confidence, reviewStatus, destination, stamp, stamp).run();
  }

  if (!pending) await env.DB.prepare("UPDATE receipt_imports SET status='applied',updated_at=? WHERE id=?").bind(now(), receiptId).run();
  return json({ ok: true, id: receiptId, retailer, auto_applied: autoApplied, pending_review: pending, ignored, detected_lines: parsedLines.length }, 201);
}
