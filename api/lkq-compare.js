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

const MAX_ORIGINAL_ITEM_LENGTH = 500;
const MAX_RECOMMENDATION_LENGTH = 300;
const MAX_SPEC_COUNT = 20;
const MAX_SPEC_KEY_LENGTH = 80;
const MAX_SPEC_VALUE_LENGTH = 500;
const MAX_LABEL_COUNT = 20;
const MAX_LABEL_LENGTH = 80;
const GEMINI_MAX_OUTPUT_TOKENS = 2048;
const GEMINI_TIMEOUT_MS = 7000;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSpecs(value) {
  if (value == null) return { ok: true, value: {} };
  if (!isPlainObject(value)) return { ok: false, error: 'originalSpecs must be an object' };

  const entries = Object.entries(value);
  if (entries.length > MAX_SPEC_COUNT) return { ok: false, error: 'Too many originalSpecs entries' };

  const safe = {};
  for (const [key, rawValue] of entries) {
    if (!key || key.length > MAX_SPEC_KEY_LENGTH) return { ok: false, error: 'originalSpecs key too long' };
    if (rawValue == null || !['string', 'number', 'boolean'].includes(typeof rawValue)) {
      return { ok: false, error: 'originalSpecs values must be simple values' };
    }
    const stringValue = String(rawValue);
    if (stringValue.length > MAX_SPEC_VALUE_LENGTH) return { ok: false, error: 'originalSpecs value too long' };
    safe[key] = stringValue;
  }
  return { ok: true, value: safe };
}

function validateLabels(value, fallbackKeys) {
  if (value == null) return { ok: true, value: fallbackKeys };
  if (!Array.isArray(value)) return { ok: false, error: 'specLabels must be an array' };
  if (value.length > MAX_LABEL_COUNT) return { ok: false, error: 'Too many specLabels' };

  const labels = [];
  for (const label of value) {
    if (typeof label !== 'string' || !label.trim() || label.length > MAX_LABEL_LENGTH) {
      return { ok: false, error: 'Invalid specLabels entry' };
    }
    labels.push(label.trim());
  }
  return { ok: true, value: labels };
}

function createDeadlineSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { originalItem, originalSpecs, specLabels, recommendation } = req.body || {};

  if (!recommendation || typeof recommendation !== 'string' || recommendation.trim().length === 0) {
    return res.status(400).json({ error: 'Missing recommendation' });
  }
  if (recommendation.length > MAX_RECOMMENDATION_LENGTH) {
    return res.status(400).json({ error: 'Recommendation too long' });
  }
  if (!originalItem || typeof originalItem !== 'string' || originalItem.trim().length === 0) {
    return res.status(400).json({ error: 'Missing originalItem' });
  }
  if (originalItem.length > MAX_ORIGINAL_ITEM_LENGTH) {
    return res.status(400).json({ error: 'originalItem too long' });
  }

  const specsResult = validateSpecs(originalSpecs);
  if (!specsResult.ok) return res.status(400).json({ error: specsResult.error });
  const safeSpecs = specsResult.value;

  const labelsResult = validateLabels(specLabels, Object.keys(safeSpecs));
  if (!labelsResult.ok) return res.status(400).json({ error: labelsResult.error });
  const labelsArr = labelsResult.value;

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

  const specsText = Object.keys(safeSpecs).length > 0
    ? Object.entries(safeSpecs).map(([key, value]) => `  ${key}: ${value}`).join('\n')
    : '';
  const labelsText = labelsArr.length > 0 ? labelsArr.join(', ') : '';

  const prompt = `You are an insurance claims specialist evaluating a specific Like Kind and Quality (LKQ) replacement recommendation.

Original Item: ${originalItem.trim()}
${specsText ? `Original Item Specs:\n${specsText}\n` : ''}Proposed Replacement: "${recommendation.trim()}"

${labelsText ? `Spec categories to evaluate (use exactly these as keys in "specs"): ${labelsText}\n` : ''}LKQ Rating Criteria (4-tier):
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
    ${labelsArr.map(label => `"${label}": "value"`).join(',\n    ')}
  },
  "retailerName": "Retailer name",
  "retailerSearchQuery": "brand model number",
  "notes": "One sentence noting the most important spec difference vs the original",
  "explanation": "2-3 sentences explaining this rating. Cover the most important spec comparisons — what aligns with the original and what differs. Be specific."
}`;

  const deadline = createDeadlineSignal(GEMINI_TIMEOUT_MS);
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
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          },
        }),
        signal: deadline.signal,
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'AI service unavailable', errorCode: 'PROVIDER_ERROR' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: 'AI service unavailable', errorCode: 'EMPTY_RESPONSE' });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch (_) {
      return res.status(502).json({ error: 'AI service unavailable', errorCode: 'INVALID_RESPONSE' });
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'AI service timed out', errorCode: 'PROVIDER_TIMEOUT' });
    }
    return res.status(502).json({ error: 'AI service unavailable', errorCode: 'PROVIDER_UNAVAILABLE' });
  } finally {
    deadline.clear();
  }
}
