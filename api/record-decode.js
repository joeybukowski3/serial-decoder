import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: false,
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function normalizeModel(str) {
  return String(str || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeBrand(str) {
  return String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { brand, model, year, month, category } = req.body || {};

  // Require brand, model, and year at minimum
  if (!brand || !model || !year) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalizedBrand = normalizeBrand(brand);
  const normalizedModel = normalizeModel(model);

  // Model must be at least 4 chars to be worth storing
  if (normalizedModel.length < 4) {
    return res.status(400).json({ error: 'Model too short' });
  }

  // Year must be a plausible 4-digit year
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum) || yearNum < 1960 || yearNum > new Date().getFullYear() + 1) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  // Rate limit per IP
  try {
    const ip = getClientIp(req);
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return res.status(429).json({ error: 'Too many requests' });
    }
  } catch (_) {}

  const key = `decoder-verified:${normalizedBrand}:${normalizedModel}`;

  const record = {
    brand: String(brand).trim(),
    model: String(model).trim(),
    normalizedBrand,
    normalizedModel,
    category: String(category || '').trim() || null,
    estimatedYear: yearNum,
    yearStart: yearNum,
    yearEnd: yearNum,
    productionRange: String(yearNum),
    decodedMonth: month ? String(month).trim() : null,
    source: 'Serial decoder — verified decode',
    notes: `Manufacture date determined from serial number using ${String(brand).trim()} serial format rules.`,
    confidence: 'verified',
    recordedAt: new Date().toISOString().slice(0, 10),
    aliases: [normalizedModel]
  };

  try {
    // Store permanently (no TTL) — verified decode data does not expire
    const existing = await redis.get(key);
    if (!existing) {
      await redis.set(key, record);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Fail silently — recording failure should never affect the user
    return res.status(200).json({ ok: true });
  }
}
