import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

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

function normalizeQuery(query) {
  return String(query || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  const sanitizedQuery = normalizeQuery(query);
  if (!sanitizedQuery) {
    return res.status(400).json({ error: 'Missing query' });
  }
  if (sanitizedQuery.length > 200) {
    return res.status(400).json({ error: 'Query too long' });
  }

  try {
    const ip = getClientIp(req);
    const { success, reset } = await ratelimit.limit(ip);
    if (!success) {
      res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again later.', errorCode: 'RATE_LIMIT' });
    }
  } catch (_) {}

  const normalizedQuery = sanitizedQuery.toLowerCase();
  const cacheKey = `smart-query-general-v1:${normalizedQuery}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }
  } catch (_) {}

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service unavailable' });
  }

  const prompt = `You are an insurance property claims research assistant helping with a broad or general item search.

Original query: "${sanitizedQuery}"

The query should be treated as a general product-family or category search, not a specific model lookup.

Allowed categories only:
- Consumer electronics
- Home appliances
- HVAC systems and components
- Water heaters and plumbing fixtures
- Electrical panels, breakers, wiring, and components
- Generators and power equipment
- Solar systems and components
- Household fixtures and built-in property items
- Commercial versions of any of the above

Instructions:
- Interpret the query only through the lens of insurable physical property and equipment
- Identify the best-fitting item category and brand, if a brand is implied or stated
- Write a brief 3-5 sentence overview suitable for an insurance claims workflow
- For brand-only queries, describe the relevant product line that would matter on claims
- For category-only queries, describe the category generally
- Return 3 to 5 refinement options that users are likely searching for
- Prioritize recent/current models first
- Include one entry-level and one premium option when the product line has a clear range
- Include one historically significant model when relevant
- Make each refinement option specific and realistic, with Brand + Model Name + Year
- Provide a practical average or mid-range representative model for calculating fallback LKQ options

Return ONLY valid JSON in this format:
{
  "itemCategory": "Smartphone",
  "brand": "Apple",
  "overview": "3-5 sentence overview here.",
  "refineOptions": [
    {
      "label": "Apple iPhone 15 Pro — 2023",
      "query": "Apple iPhone 15 Pro",
      "year": "2023"
    }
  ],
  "averageModelLabel": "Apple iPhone 14 — 2022",
  "averageModelQuery": "Apple iPhone 14",
  "averageModelCategory": "Smartphone"
}`;

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
            temperature: 0.2,
          },
        }),
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

    const parsed = JSON.parse(text);
    const payload = {
      itemCategory: normalizeQuery(parsed?.itemCategory) || 'General Property Item',
      brand: normalizeQuery(parsed?.brand) || '',
      overview: normalizeQuery(parsed?.overview) || 'This search appears to describe a general property item category that may require a more specific model for precise LKQ research.',
      refineOptions: Array.isArray(parsed?.refineOptions)
        ? parsed.refineOptions
            .map((item) => ({
              label: normalizeQuery(item?.label),
              query: normalizeQuery(item?.query),
              year: normalizeQuery(item?.year),
            }))
            .filter((item) => item.label && item.query)
            .slice(0, 5)
        : [],
      averageModelLabel: normalizeQuery(parsed?.averageModelLabel) || '',
      averageModelQuery: normalizeQuery(parsed?.averageModelQuery) || '',
      averageModelCategory: normalizeQuery(parsed?.averageModelCategory) || normalizeQuery(parsed?.itemCategory) || 'item',
    };

    if (!payload.averageModelQuery && payload.refineOptions.length) {
      payload.averageModelQuery = payload.refineOptions[Math.min(1, payload.refineOptions.length - 1)].query;
    }
    if (!payload.averageModelLabel && payload.refineOptions.length) {
      payload.averageModelLabel = payload.refineOptions[Math.min(1, payload.refineOptions.length - 1)].label;
    }

    try {
      await redis.set(cacheKey, payload, { ex: 60 * 60 * 24 });
    } catch (_) {}

    return res.status(200).json(payload);
  } catch (_) {
    return res.status(502).json({ error: 'General research service unavailable' });
  }
}
