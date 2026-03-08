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
  const cacheKey = `smart-query-interpret-v1:${normalizedQuery}`;

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

  const prompt = `You are a query interpretation layer for an insurance property claims research tool called Item Assist.

Input query: "${sanitizedQuery}"

Interpret the query ONLY as a physical item that could appear on an insurance property claim.

Allowed categories only:
- Consumer electronics (TVs, phones, laptops, tablets, audio, cameras, gaming)
- Home appliances (washers, dryers, refrigerators, dishwashers, ovens, microwaves, etc.)
- HVAC systems and components (AC units, furnaces, heat pumps, thermostats, ductwork)
- Water heaters and plumbing fixtures (tankless, traditional, fixtures, pumps)
- Electrical panels, wiring, breakers, meters, and components
- Generators and power equipment
- Solar systems and components
- Household fixtures and built-in property items
- Commercial versions of any of the above

Hard interpretation rules:
- Never interpret the query as anything outside those categories
- Treat ambiguous words as property/equipment brands or items
- A shark is always Shark brand equipment, never an animal
- Apple is always Apple electronics, never fruit
- Carrier is always Carrier HVAC
- Nest is always a Nest thermostat or Google Nest device
- Always think like an expert insurance inspector focused only on damaged property and equipment

Output behavior:
- Set queryKind to "general" for brand-only, category-only, broad brand + category queries, or any search that does not identify a single product
- Set queryKind to "specific" when the query includes a model number, clear distinguishing specs, or enough detail to identify a narrow product target
- If the query is already a clear model number or complete, unambiguous item description, use action "bypass"
- Otherwise use action "suggest" and produce between 1 and 5 ranked suggested interpretations
- Suggestions do NOT need to be related to each other; they are independent best guesses
- Suggestions must be specific and actionable, not vague category labels
- Expand abbreviations, partial words, and likely typos into full item descriptions
- Only use action "no_results" when the query is extremely vague or meaningless for property claims, such as pure gibberish or numeric-only text like "33", "abc", or "zzz"
- Only use action "out_of_scope" if the final query still cannot plausibly map to any valid property/equipment item category after best effort interpretation

Examples:
- "Shark Bad" -> "Shark Robot Vacuum", "Shark Steam Mop", "Shark Cordless Vacuum"
- "LG wash" -> "LG Front Load Washing Machine", "LG Top Load Washing Machine"
- "Carr AC" -> "Carrier Central Air Conditioner", "Carrier Mini Split AC Unit"
- "Samung 65" -> "Samsung 65-inch 4K Smart TV"
- "hot wat heat" -> "Gas Water Heater", "Electric Water Heater", "Tankless Water Heater"
- "braker box" -> "Electrical Panel / Breaker Box"

Return ONLY valid JSON in this format:
{
  "action": "bypass",
  "queryKind": "specific",
  "confidence": "high",
  "scopeValid": true,
  "message": null,
  "suggestions": [
    "Specific item suggestion 1"
  ]
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
            temperature: 0.1,
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
      action: ['bypass', 'suggest', 'no_results', 'out_of_scope'].includes(parsed?.action) ? parsed.action : 'suggest',
      queryKind: ['general', 'specific'].includes(parsed?.queryKind) ? parsed.queryKind : 'specific',
      confidence: ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : 'medium',
      scopeValid: parsed?.scopeValid !== false,
      message: typeof parsed?.message === 'string' && parsed.message.trim() ? parsed.message.trim() : null,
      suggestions: Array.isArray(parsed?.suggestions)
        ? parsed.suggestions.map((s) => normalizeQuery(s)).filter(Boolean).slice(0, 5)
        : [],
    };

    if (payload.action === 'suggest' && payload.suggestions.length === 0) {
      payload.action = 'no_results';
    }
    if (payload.action === 'bypass' && payload.suggestions.length === 0) {
      payload.suggestions = [sanitizedQuery];
    }
    if (payload.action === 'no_results' && !payload.message) {
      payload.message = "We couldn't identify an item from your search. Try entering a brand name, model number, or item description such as 'LG refrigerator' or 'Carrier AC unit'.";
      payload.scopeValid = false;
    }
    if (payload.action === 'out_of_scope' && !payload.message) {
      payload.message = 'Item Assist is designed for property and equipment research. Please enter an appliance, electronic, HVAC, electrical, or household item.';
      payload.scopeValid = false;
    }

    try {
      await redis.set(cacheKey, payload, { ex: 60 * 60 * 24 });
    } catch (_) {}

    return res.status(200).json(payload);
  } catch (_) {
    return res.status(502).json({ error: 'Interpretation service unavailable' });
  }
}
