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
  const cacheKey = `lkq-lookup-v2:${normalizedQuery}`;

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

LKQ Evaluation Standards — use these category-specific specs for the specLabels array:
- Appliances (washers, dryers): ["Capacity", "Fuel Type", "Installation Type", "Efficiency Rating", "Dimensions"]
- Refrigerators: ["Capacity", "Configuration", "Ice Maker", "Efficiency Rating", "Dimensions"]
- Ranges/Ovens: ["Fuel Type", "Configuration", "Oven Capacity", "Burner Count", "Dimensions"]
- Dishwashers: ["Place Settings", "Wash Cycles", "Noise Level", "Efficiency Rating", "Installation Type"]
- HVAC (furnaces, AC, heat pumps): ["BTU / Tonnage", "SEER / AFUE / HSPF", "Fuel Type", "Configuration", "Phase"]
- Water heaters: ["Tank vs Tankless", "Capacity (gal)", "Fuel Type", "First-Hour Delivery", "UEF Rating"]
- Electronics/TVs: ["Screen Size", "Panel Type", "Resolution", "Refresh Rate", "Smart Platform"]
- Generators: ["Rated Wattage", "Fuel Type", "Standby vs Portable", "Phase", "Transfer Switch"]
- Commercial equipment: ["Capacity / Output", "Power Requirements", "Certifications", "Construction", "Phase"]
- Lighting: ["Lumen Output", "Color Temp (CCT)", "CRI", "Fixture Type", "Dimming"]
- Other: choose 5 specs most relevant to LKQ determination for the category

LKQ Rating Criteria (4-tier):
- NOT LKQ (RED): Different category/type, incompatible replacement, significantly inferior key specs, wrong fuel/power/installation class
- CLOSE MATCH (ORANGE): Close in specs but minor downgrade, older/lower series, or slight inferiority
- LKQ (GREEN): Equal or fair-variance equivalent on key specs; true like kind and quality
- ABOVE LKQ (GOLD): A clear premium-tier or major value/performance/class upgrade, not just a normal newer model

ABOVE LKQ threshold (strict):
- Do NOT use ABOVE LKQ for routine generational improvements, normal year-over-year electronics gains, or small spec bumps that naturally happen with newer replacements
- Most newer electronics, appliances, and TVs that are simply current equivalents should still be rated LKQ, not ABOVE LKQ
- Use ABOVE LKQ only when the replacement is materially higher tier, premium class, or substantially better in market value and feature set
- Prefer ABOVE LKQ only when there is a clearly meaningful jump such as roughly 2x market value, a major capacity/output increase, or an obvious class/tier upgrade
- Good ABOVE LKQ examples: replacing a Honda with a BMW; replacing a Hotpoint dishwasher with a KitchenAid
- If the replacement is same class/use case and just modestly better because it is newer, rate it LKQ

Retailer guidance:
- Major home appliances: "AJ Madison" or "Home Depot"
- HVAC and mechanical: "Grainger" or "Ferguson"
- Consumer electronics: "Best Buy" or "Amazon"
- Commercial/industrial: "Grainger" or "Amazon Business"
- General household: "Amazon" or "Home Depot"

New-condition requirement (strict):
- Every replacement option must be purchasable as brand NEW from an authorized retailer
- Never include refurbished, renewed, open-box, pre-owned, used, or certified pre-owned listings
- retailerSearchQuery must target a new-condition listing specifically
- If a candidate model is only available refurbished/used, exclude it and find the next qualifying NEW option
- If no qualifying NEW option can be confirmed for a slot, leave the slot empty (do not force-fill with used/refurbished)
- This rule applies to all replacement slots including Best Match

Replacement table selection rules (strict):
- Target order is: Original Item, Best Match, Alternative Replacement 1, Alternative Replacement 2, Your Pick
- Best Match must be same-brand successor or same-brand current equivalent when available and must not be a downgrade
- Alternative Replacement 1 and 2 must be different models from comparable quality brands and must not be duplicates
- Exclude any option that is CLOSE MATCH or NOT LKQ; do not show or mention excluded options
- Never include lower series, older generation, lower tier, or spec-downgrade models
- Only include options that qualify as LKQ or ABOVE LKQ
- If no same-brand LKQ/ABOVE LKQ option exists, do not force one; prioritize qualifying alternatives instead
- If fewer qualifying options exist, return fewer options (do not pad with weak options)
- If no qualifying options exist, return an empty replacementOptions array and explain in successorStatus.explanation

Overall LKQ rating determination:
- If majority of key specs are GREEN and none are RED, rate as LKQ
- Rate as ABOVE LKQ only when the item is a substantial step-up in tier, class, value, or feature/performance package; a single mild improvement is not enough
- A candidate should usually remain LKQ unless the upgrade is clearly significant, such as about 2x price/value, clearly premium-brand substitution, or major capacity/performance gain
- If any key spec is RED, rate as NOT LKQ (exclude from replacementOptions)
- If majority of key specs are ORANGE, rate as CLOSE MATCH (exclude from replacementOptions)
- Mixed GREEN/ORANGE with no RED may still be LKQ when orange differences are minor and non-core

Successor status rules:
- "direct_successor": the manufacturer released a named model to replace this exact model (use when you know this with confidence)
- "same_brand_equivalent": the same brand has a current equivalent product (same tier/line, different model number) but not a formally named successor
- "none": the manufacturer no longer makes this category or has no clear equivalent; explain briefly

Respond with ONLY valid JSON in this exact format:
{
  "itemSummary": {
    "name": "Full identified item name (Brand + descriptive model name, e.g. LG WM4000HWA Front-Load Washer)",
    "brand": "Brand name only (e.g. LG)",
    "model": "Model number only (e.g. WM4000HWA), or null if unknown",
    "category": "Short category label (e.g. Front-Load Washer, 65-inch 4K TV, Gas Furnace)",
    "description": "1-2 sentence description of this item and its primary function",
    "estimatedAgeRange": "Year range string (e.g. 2018-2022) or null if unknown",
    "availability": "Currently Available | Discontinued | Availability Unconfirmed",
    "originalPriceDisplay": "Current retail range if sold new; otherwise ~$X,XXX (MSRP) or ~$X,XXX (Avg. Market Value)"
},
  "specLabels": ["Label1", "Label2", "Label3", "Label4", "Label5"],
  "originalSpecs": {
    "Label1": "value",
    "Label2": "value",
    "Label3": "value",
    "Label4": "value",
    "Label5": "value"
  },
  "successorStatus": {
    "type": "direct_successor",
    "name": "Brand + product name of successor/equivalent (null if type is none)",
    "model": "Model number of successor/equivalent (null if type is none)",
    "explanation": "One sentence explaining the successor/equivalent relationship, or why none exists"
  },
  "bestMatchLabel": "Best Match",
  "replacementOptions": [
    {
      "name": "Full product name (Brand + descriptive model name)",
      "model": "Model number",
      "brand": "Brand name only",
      "specs": {
        "Label1": "value",
        "Label2": "value",
        "Label3": "value",
        "Label4": "value",
        "Label5": "value"
      },
      "lkqRating": "MATCH",
      "notes": "One concise sentence explaining the key spec comparison vs original",
      "priceRange": "$XXX–$XXX",
      "retailerName": "Retailer name",
      "retailerSearchQuery": "Optimized search string (brand + model number)"
    }
  ]
}

Rules:
- specLabels must be exactly 5 strings appropriate for this item category
- originalSpecs keys must exactly match specLabels values
- Each replacementOption.specs keys must exactly match specLabels values
- Include up to 3 replacement options total (Best Match + up to 2 alternatives), only if they qualify
- replacementOptions must contain ONLY LKQ-qualified options:
  - Use "MATCH" when the option is LKQ (green)
  - Use "ABOVE LKQ" when the option is above LKQ (gold)
  - Never return CLOSE MATCH or NOT LKQ options in replacementOptions
- If successorStatus.type is "direct_successor" or "same_brand_equivalent", the first replacement option should be that successor/equivalent when it qualifies and must use the same name/model as successorStatus
- Include options from multiple manufacturers when possible
- priceRange reflects current retail pricing; use "N/A" if unknown
- retailerSearchQuery is a clean search string, not a URL
- replacementOptions must be NEW-condition purchase candidates only (no refurbished/used/open-box)
- If original item is still sold new, itemSummary.originalPriceDisplay should be current retail range
- If original item is discontinued, itemSummary.originalPriceDisplay should be "~$X,XXX (MSRP)" or "~$X,XXX (Avg. Market Value)"`;

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


