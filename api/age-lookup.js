import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Initialise once per cold start — not inside the handler
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, '1 m'),
  analytics: false,
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { query } = req.body || {};

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Missing query' });
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Query too long' });
  }

  // ── Rate limiting (fail open if Redis is unavailable) ─────────────────────
  try {
    const ip = getClientIp(req);
    const { success, reset } = await ratelimit.limit(ip);
    if (!success) {
      res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
  } catch (_) {
    // Redis unavailable — allow request rather than blocking legitimate users
  }

  const sanitizedQuery = query.trim();
  const normalizedQuery = sanitizedQuery.toLowerCase().replace(/\s+/g, ' ');
  const queryCacheKey = `age-lookup:${normalizedQuery}`;

  // ── Query-level cache (14-day TTL) ────────────────────────────────────────
  try {
    const cached = await redis.get(queryCacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }
  } catch (_) {
    // Cache miss or unavailable — proceed to AI
  }

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service unavailable' });
  }

  const prompt = `You are a product research specialist. Given the following appliance or water heater model number, brand, or description, determine the most likely manufacture date or production era.

Research approach:
- Identify the brand and model from the query
- Determine when this model was first manufactured or sold
- Look for earliest known references: product launches, first reviews, first retail listings, manual publication dates
- If an exact year cannot be determined, provide a production year range
- Consider model number patterns that indicate year/generation

Query: "${sanitizedQuery}"

Respond with ONLY valid JSON in this exact format:
{
  "brand": "Brand name or Unknown",
  "model": "Model number if identifiable",
  "estimatedYear": "Most likely manufacture year or null",
  "yearRange": "e.g. 2015-2018 or null",
  "notes": "Any important context about this determination",
  "serialLocation": "Brief description of where to physically find the serial number on this type of product (e.g. 'Back panel, lower-left sticker' or 'Inside door frame' or 'Bottom of device')",
  "serialRule": "One-sentence general rule for how to decode the serial number for this brand and product type, if known (e.g. 'Samsung TVs: character 8 encodes the year, character 9 the month' or 'Use the Serial Decoder tab above for precise dating' if a standard format is unknown)",
  "exampleModelNumber": "One specific real model number if the query is a generic description with no model number present (e.g. 'WRF535SWHZ' for 'Whirlpool French door refrigerator'). Set to null if the query already contains a model number or if suggestedModelNumbers is populated.",
  "suggestedModelNumbers": ["Array of 2-3 plausible complete model numbers only if the query looks like a partial or incomplete model number prefix. Set to empty array [] in all other cases. Never populate both this and exampleModelNumber at the same time."]
}

Rules for exampleModelNumber and suggestedModelNumbers:
- Query is a generic description (e.g. 'Whirlpool side-by-side refrigerator'): set exampleModelNumber to one real example model number; leave suggestedModelNumbers as [].
- Query looks like a partial model prefix (e.g. 'GE PFE' or 'WRF535'): set suggestedModelNumbers to 2-3 plausible complete model numbers; leave exampleModelNumber as null.
- Query is already a complete model number: set both exampleModelNumber to null and suggestedModelNumbers to [].`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'No response from AI service' });
    }

    const result = JSON.parse(text);

    // ── Write query cache (14-day TTL) ────────────────────────────────────
    try {
      await redis.set(queryCacheKey, result, { ex: 14 * 24 * 60 * 60 });
    } catch (_) {}

    // ── Write brand cache — stable fields only (90-day TTL) ──────────────
    if (result.brand && result.brand !== 'Unknown') {
      try {
        const brandKey = `brand-info:${result.brand.toLowerCase().replace(/\s+/g, '_')}`;
        const brandData = {};
        if (result.serialLocation) brandData.serialLocation = result.serialLocation;
        if (result.serialRule)     brandData.serialRule     = result.serialRule;
        if (Object.keys(brandData).length > 0) {
          await redis.set(brandKey, brandData, { ex: 90 * 24 * 60 * 60 });
        }
      } catch (_) {}
    }

    return res.status(200).json(result);
  } catch (_) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
