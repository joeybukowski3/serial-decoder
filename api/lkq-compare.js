import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { originalItem, originalSpecs, specLabels, recommendation } = req.body || {};

  if (!recommendation || typeof recommendation !== 'string' || recommendation.trim().length === 0) {
    return res.status(400).json({ error: 'Missing recommendation' });
  }

  if (!originalItem || typeof originalItem !== 'string' || originalItem.trim().length === 0) {
    return res.status(400).json({ error: 'Missing originalItem' });
  }

  if (recommendation.length > 300) {
    return res.status(400).json({ error: 'Recommendation too long' });
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service unavailable' });
  }

  const specsText =
    originalSpecs && typeof originalSpecs === 'object' && Object.keys(originalSpecs).length > 0
      ? Object.entries(originalSpecs)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n')
      : '';

  const labelsArr = Array.isArray(specLabels) && specLabels.length > 0
    ? specLabels
    : (originalSpecs ? Object.keys(originalSpecs) : []);

  const labelsText = labelsArr.length > 0 ? labelsArr.join(', ') : '';

  const prompt = `You are an insurance claims specialist evaluating a specific Like Kind and Quality (LKQ) replacement recommendation.

Original Item: ${originalItem.trim()}
${specsText ? `Original Item Specs:\n${specsText}\n` : ''}
Proposed Replacement: "${recommendation.trim()}"

${labelsText ? `Spec categories to evaluate (use exactly these as keys in "specs"): ${labelsText}\n` : ''}
LKQ Rating Criteria (4-tier):
- NOT LKQ: Different category/type, incompatible replacement, significantly inferior key specs, wrong fuel/power/installation class
- CLOSE MATCH: Close in specs but minor downgrade, older/lower series, or slight inferiority
- MATCH: Equal or fair-variance equivalent on key specs; true like kind and quality
- ABOVE LKQ: Reserved only for a clear and significant upgrade, not a slight improvement

ABOVE LKQ threshold (strict):
- Do NOT use ABOVE LKQ for routine generational improvements, normal year-over-year electronics gains, or small spec bumps
- Most newer electronics, appliances, and TVs that are simply current equivalents should still be MATCH, not ABOVE LKQ
- Use ABOVE LKQ only when there is a meaningful jump such as roughly 2x market value, a major capacity/output increase, or an obvious premium tier/class upgrade
- Good ABOVE LKQ examples: replacing a Honda with a BMW; replacing a Hotpoint dishwasher with a KitchenAid
- If the replacement is only modestly better because it is newer, rate it MATCH

Retailer guidance:
- Major home appliances: "AJ Madison" or "Home Depot"
- HVAC and mechanical: "Grainger" or "Ferguson"
- Consumer electronics: "Best Buy" or "Amazon"
- Commercial/industrial: "Grainger" or "Amazon Business"
- General household: "Amazon" or "Home Depot"

Respond with ONLY valid JSON:
{
  "rating": "MATCH",
  "name": "Full product name (Brand + descriptive model name)",
  "model": "Model number, or null if not identifiable",
  "brand": "Brand name only",
  "priceRange": "$XXX–$XXX or N/A",
  "specs": {
    ${labelsArr.map(l => `"${l}": "value"`).join(',\n    ')}
  },
  "retailerName": "Retailer name",
  "retailerSearchQuery": "brand model number",
  "notes": "One sentence noting the most important spec difference vs the original",
  "explanation": "2-3 sentences explaining this rating. Cover the most important spec comparisons — what aligns with the original and what differs. Be specific."
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

    return res.status(200).json(JSON.parse(text));
  } catch (_) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
