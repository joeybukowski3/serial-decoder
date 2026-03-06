import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Missing query' });
  }

  if (query.length > 300) {
    return res.status(400).json({ error: 'Query too long' });
  }

  // Rate limiting (fail open if Redis unavailable)
  try {
    const ip = getClientIp(req);
    const { success, reset } = await ratelimit.limit(ip);
    if (!success) {
      res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again later.', errorCode: 'RATE_LIMIT' });
    }
  } catch (_) {}

  const sanitizedQuery = query.trim();
  const normalizedQuery = sanitizedQuery.toLowerCase().replace(/\s+/g, ' ');
  const cacheKey = `lkq-lookup:${normalizedQuery}`;

  // Cache check (7-day TTL)
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

  const prompt = `You are an insurance claims specialist evaluating Like Kind and Quality (LKQ) replacements for damaged or lost items. Given the following item query, identify the original item and return a structured LKQ replacement evaluation.

Query: "${sanitizedQuery}"

LKQ Evaluation Standards — weight these specs for like kind and quality determination:
- Appliances (washers, dryers, refrigerators, ranges, dishwashers): capacity (cu ft/cu in), fuel type (gas/electric/dual), installation type (built-in/freestanding/slide-in), finish, efficiency rating (Energy Star), dimensions
- HVAC (furnaces, AC, heat pumps, boilers): BTU or tonnage, SEER/AFUE/HSPF rating, fuel type (gas/electric/heat pump/oil), configuration (central/mini-split/window/packaged), installation type (air handler/split system)
- Water heaters: tank vs tankless, capacity (gallons), fuel type, first-hour delivery, energy factor/UEF
- Electronics/TVs: screen size, panel technology (OLED/QLED/Neo QLED/LED), resolution (4K/8K), smart platform, HDR support, refresh rate
- Generators: rated wattage, fuel type (gas/propane/diesel/natural gas), standby vs portable, phase (single/three), transfer switch type
- Commercial equipment: capacity/throughput, power requirements (voltage/phase/amperage), industry certifications (NSF/UL/CE), construction material
- Electrical components: voltage rating, amperage, phase, certifications, form factor
- Lighting: lumen output, color temperature (CCT), CRI, fixture type, dimming capability

Works for both residential AND commercial items. For uncommon or commercial brands, identify the product category and provide equivalent replacements.
If the item is not widely recognized, use description context to determine category and still provide relevant options.

Retailer selection guidance:
- Major home appliances: "AJ Madison" or "Home Depot"
- HVAC and mechanical systems: "Grainger" or "Ferguson"
- Consumer electronics and TVs: "Best Buy" or "Amazon"
- Commercial or industrial equipment: "Grainger" or "Amazon Business"
- Small appliances and general household: "Amazon" or "Home Depot"

LKQ Rating Criteria:
- MATCH: Same category, same fuel type/power source, same installation type, capacity within 10%, equivalent or better efficiency rating, same or newer generation
- CLOSE MATCH: Same category, same fuel type, capacity within 20%, minor spec differences that do not significantly affect functionality
- NOT LKQ: Different fuel type, capacity difference greater than 20%, wrong installation type, or fundamentally different product class

Respond with ONLY valid JSON in this exact format:
{
  "itemSummary": {
    "name": "Full identified item name (e.g. LG WM4000HWA Front-Load Washer)",
    "description": "1-2 sentence description of this item and its primary function",
    "keySpecs": {
      "Spec Name": "Value"
    },
    "estimatedAgeRange": "Year range string or null if unknown"
  },
  "replacementOptions": [
    {
      "name": "Full product name (Brand + descriptive model name)",
      "model": "Model number",
      "keySpecs": {
        "Spec Name": "Value"
      },
      "lkqRating": "MATCH",
      "lkqRationale": "One concise sentence explaining why this rating was assigned",
      "priceRange": "$XXX–$XXX",
      "retailerName": "Retailer name",
      "retailerSearchQuery": "Optimized search string (brand + model number)"
    }
  ]
}

Rules:
- keySpecs in replacementOptions must use the same spec category names as itemSummary.keySpecs for direct comparison
- Include 3 to 5 replacement options, sorted: MATCH first, then CLOSE MATCH, then NOT LKQ if needed
- Include options from multiple manufacturers when possible
- priceRange should reflect current retail pricing; use "N/A" if unknown
- retailerSearchQuery should be a clean search string, not a URL`;

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

    const result = JSON.parse(text);

    // Cache result for 7 days
    try {
      await redis.set(cacheKey, result, { ex: 7 * 24 * 60 * 60 });
    } catch (_) {}

    return res.status(200).json(result);
  } catch (_) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
