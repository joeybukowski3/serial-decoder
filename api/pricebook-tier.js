import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import fs from 'fs';
import path from 'path';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  analytics: false,
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function normalizeText(v) {
  return String(v || '').toLowerCase().trim();
}

// ── Category mapping ────────────────────────────────────────────────────────
// Maps Gemini category strings → pricebook keys
const CATEGORY_MAP = {
  'television': 'TVs', 'tv': 'TVs', 'smart tv': 'TVs', 'oled': 'TVs', 'qled': 'TVs',
  'refrigerator': 'Refrigerators', 'fridge': 'Refrigerators', 'french door': 'Refrigerators',
  'side-by-side': 'Refrigerators', 'top freezer': 'Refrigerators', 'bottom freezer': 'Refrigerators',
  'wall oven': 'Wall Oven', 'built-in oven': 'Wall Oven', 'double oven': 'Wall Oven',
  'dishwasher': 'Dishwasher',
  'gas range': 'Gas Range', 'gas stove': 'Gas Range', 'gas cooktop': 'Gas Range',
  'electric range': 'Electric Range', 'electric stove': 'Electric Range', 'induction range': 'Electric Range',
  'microwave': 'Microwave', 'over-the-range microwave': 'Microwave', 'otr microwave': 'Microwave',
};

// ── Brand tier mapping ──────────────────────────────────────────────────────
const BRAND_TIER_MAP = {
  // Value
  'insignia': 'Value', 'onn': 'Value', 'rca': 'Value', 'element': 'Value',
  'amana': 'Value',
  // Standard
  'tcl': 'Standard', 'hisense': 'Standard', 'vizio': 'Standard',
  'whirlpool': 'Standard', 'maytag': 'Standard', 'frigidaire': 'Standard', 'ge': 'Standard',
  'zline': 'Standard',
  // Premium
  'samsung': 'Premium', 'lg': 'Premium', 'sony': 'Premium', 'bosch': 'Premium',
  'panasonic': 'Premium',
  // Upper Premium
  'kitchenaid': 'Upper Premium', 'ge profile': 'Upper Premium', 'ge cafe': 'Upper Premium',
  'jenn-air': 'Upper Premium', 'jennair': 'Upper Premium', 'sharp': 'Upper Premium',
  // Luxury
  'sub-zero': 'Luxury', 'wolf': 'Luxury', 'thermador': 'Luxury', 'miele': 'Luxury',
  'viking': 'Luxury', 'dacor': 'Luxury',
};

function detectCategory(category, features) {
  const text = normalizeText(category + ' ' + (features || ''));
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(key)) return val;
  }
  return null;
}

function detectBrandTier(brand) {
  const b = normalizeText(brand);
  for (const [key, tier] of Object.entries(BRAND_TIER_MAP)) {
    if (b.includes(key)) return tier;
  }
  return null;
}

function scoreEntry(entry, params) {
  let score = 0;
  const { brand_tier, category_hint, size_hint, style_hint, finish_hint } = params;

  // Brand tier match — most important
  if (brand_tier && entry.brand_tier) {
    if (normalizeText(entry.brand_tier) === normalizeText(brand_tier)) score += 100;
  }

  // Style/section match
  if (style_hint && entry.section) {
    const sec = normalizeText(entry.section);
    const sty = normalizeText(style_hint);
    if (sec.includes(sty) || sty.includes(normalizeText(entry.style || ''))) score += 40;
  }

  // Size match
  if (size_hint && entry.size) {
    const sz = normalizeText(size_hint);
    const esz = normalizeText(entry.size);
    if (sz === esz) score += 30;
    else if (sz.replace(/[^0-9]/g, '') === esz.replace(/[^0-9]/g, '')) score += 20;
  }

  // Finish match
  if (finish_hint && entry.finish) {
    const fn = normalizeText(finish_hint);
    const ef = normalizeText(entry.finish);
    if (ef !== 'any' && ef.includes(fn)) score += 15;
  }

  return score;
}

function matchTier(pricebook, params) {
  const { pricebook_category, brand_tier } = params;
  if (!pricebook_category || !pricebook[pricebook_category]) return null;

  const entries = pricebook[pricebook_category];
  let best = null;
  let bestScore = -1;

  for (const entry of entries) {
    const score = scoreEntry(entry, params);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best;
}

function buildExplanation(entry, detectedBrand, detectedTier) {
  const parts = [];
  if (detectedBrand) parts.push(`${detectedBrand} is classified as a ${entry.brand_tier} tier brand`);
  if (entry.style) parts.push(`matching the ${entry.style} style`);
  if (entry.size) parts.push(`in the ${entry.size} size range`);
  if (entry.features) parts.push(`with typical features: ${entry.features}`);
  return parts.join(', ') + '.';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand, category, size, style, finish, features, model } = req.body || {};
  if (!brand && !category) return res.status(400).json({ error: 'Missing brand or category' });

  try {
    const ip = getClientIp(req);
    const { success, reset } = await ratelimit.limit(ip);
    if (!success) {
      res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests', errorCode: 'RATE_LIMIT' });
    }
  } catch (_) {}

  const cacheKey = `pricebook-tier-v1:${normalizeText([brand,category,size,style,finish].join('|'))}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(cached);
  } catch (_) {}

  // Load pricebook JSON
  let pricebook;
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'pricebook.json');
    pricebook = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Pricebook unavailable' });
  }

  // Detect category and brand tier
  const pricebook_category = detectCategory(category, features);
  const detected_brand_tier = detectBrandTier(brand) || 'Standard';

  if (!pricebook_category) {
    return res.status(200).json({
      matched: false,
      reason: 'Category not found in pricebook',
      tier: null,
    });
  }

  const params = {
    pricebook_category,
    brand_tier: detected_brand_tier,
    size_hint: size,
    style_hint: style,
    finish_hint: finish,
  };

  const match = matchTier(pricebook, params);

  if (!match) {
    return res.status(200).json({
      matched: false,
      reason: 'No tier match found',
      tier: null,
    });
  }

  const payload = {
    matched: true,
    tier: {
      brand_tier:    match.brand_tier,
      quality:       match.quality,
      style:         match.style,
      size:          match.size,
      market_price:  match.market_price,
      price_low:     match.price_low,
      price_high:    match.price_high,
      features:      match.features,
      bb_sku:        match.bb_sku,
      bb_price:      match.bb_price,
      bb_description:match.bb_description,
      bb_link:       match.bb_link,
    },
    explanation: buildExplanation(match, brand, detected_brand_tier),
    category: pricebook_category,
    detected_brand_tier,
  };

  try {
    await redis.set(cacheKey, payload, { ex: 60 * 60 * 6 }); // cache 6hrs
  } catch (_) {}

  return res.status(200).json(payload);
}
