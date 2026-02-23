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

const HVAC_SERIAL_CONFIG = [
  { brand: 'Goodman', aliases: ['goodman'], type: 'yyMM' },
  { brand: 'Amana', aliases: ['amana'], type: 'yyMM' },
  { brand: 'Carrier', aliases: ['carrier'], type: 'wwYY' },
  { brand: 'Bryant', aliases: ['bryant'], type: 'wwYY' },
  { brand: 'Payne', aliases: ['payne'], type: 'wwYY' },
  { brand: 'Rheem', aliases: ['rheem'], type: 'letterWWYY' },
  { brand: 'Ruud', aliases: ['ruud'], type: 'letterWWYY' },
  { brand: 'Trane', aliases: ['trane'], type: 'wwYY' },
  { brand: 'Lennox', aliases: ['lennox'], type: 'wwYY' },
  { brand: 'York', aliases: ['york'], type: 'wwYY' },
];

const HVAC_MONTHS = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};

const HVAC_ERA_DATA = {
  carrier: {
    defaultNote: 'Carrier cabinet heuristic: Round cabinets are generally pre-1980; square cabinets are typically 1980 and newer.',
    rules: [
      { key: 'round', yearRange: 'Pre-1980', note: 'Carrier Round cabinet era points to pre-1980 production.' },
      { key: 'square', yearRange: '1980-Present', note: 'Carrier Square cabinet era points to post-1980 production.' }
    ]
  },
  rheem: {
    defaultNote: 'Rheem series heuristic: Classic lines trend earlier; Prestige lines are modern-era production.',
    rules: [
      { key: 'classic', yearRange: '1985-2005', note: 'Rheem Classic series typically aligns with older production windows.' },
      { key: 'prestige', yearRange: '2006-Present', note: 'Rheem Prestige series typically aligns with newer production windows.' }
    ]
  },
  ruud: {
    defaultNote: 'Ruud series heuristic: Classic lines trend earlier; Prestige lines are modern-era production.',
    rules: [
      { key: 'classic', yearRange: '1985-2005', note: 'Ruud Classic series typically aligns with older production windows.' },
      { key: 'prestige', yearRange: '2006-Present', note: 'Ruud Prestige series typically aligns with newer production windows.' }
    ]
  },
  goodman: {
    defaultNote: 'Goodman legacy heuristic: Janitrol-branded units generally indicate pre-2000 production.',
    rules: [
      { key: 'janitrol', yearRange: 'Pre-2000', note: 'Janitrol legacy branding indicates earlier Goodman-era equipment (typically pre-2000).' }
    ]
  },
  trane: {
    defaultNote: 'Trane model-family heuristic: XE lines are earlier; XR lines are later generations.',
    rules: [
      { key: 'xe', yearRange: '1990-2009', note: 'Trane XE series is generally associated with 1990s to late-2000s production.' },
      { key: 'xr', yearRange: '2000-Present', note: 'Trane XR series is generally associated with 2000s and later production.' }
    ]
  },
  york: {
    defaultNote: 'York family heuristic: Affinity and Latitude lines are commonly mapped to mid-2000s to mid-2010s cycles.',
    rules: [
      { key: 'affinity', yearRange: '2005-2015', note: 'York Affinity series commonly maps to 2005-2015 production cycles.' },
      { key: 'latitude', yearRange: '2005-2015', note: 'York Latitude series commonly maps to 2005-2015 production cycles.' }
    ]
  }
};

const APPLIANCE_ERA_DATA = {
  whirlpool: {
    defaultNote: 'Whirlpool washer-era heuristic: Direct Drive platforms are generally older; Vertical Modular platforms are newer.',
    rules: [
      { key: 'direct drive', yearRange: '1980s-2010', note: 'Whirlpool Direct Drive washer platforms are commonly associated with 1980s through around 2010.' },
      { key: 'vertical modular', yearRange: '2010-Present', note: 'Whirlpool Vertical Modular washer platforms are commonly associated with 2010 and newer production.' },
      { key: 'vmw', yearRange: '2010-Present', note: 'Whirlpool VMW (Vertical Modular Washer) architecture generally aligns with 2010 and newer production.' }
    ]
  },
  ge: {
    defaultNote: 'GE family heuristic: Profile and Monogram lines follow different premium/flagship timelines; legacy Camelback consoles indicate older GE washer generations.',
    rules: [
      { key: 'profile', yearRange: '2000-Present', note: 'GE Profile lines are generally modern-era production (commonly 2000 and newer).' },
      { key: 'monogram', yearRange: '1990s-Present', note: 'GE Monogram lines are generally premium long-running production, commonly from the late 1990s onward.' },
      { key: 'camelback', yearRange: 'Pre-2000', note: 'GE Camelback console styling generally indicates older, pre-2000 era washer design.' }
    ]
  },
  samsung: {
    defaultNote: 'Samsung washer-feature heuristic: VRT appears in modern generations; AddWash is a post-2016 feature era.',
    rules: [
      { key: 'vrt', yearRange: 'Post-2006', note: 'Samsung VRT (Vibration Reduction Technology) is generally associated with post-2006 production.' },
      { key: 'addwash', yearRange: 'Post-2016', note: 'Samsung AddWash models are generally associated with post-2016 production.' }
    ]
  },
  lg: {
    defaultNote: 'LG washer-feature heuristic: Inverter DirectDrive branding generally aligns with production cycles starting in 2009.',
    rules: [
      { key: 'inverter directdrive', yearRange: '2009-Present', note: 'LG Inverter DirectDrive branding is generally associated with 2009 and newer production cycles.' },
      { key: 'directdrive', yearRange: '2009-Present', note: 'LG DirectDrive branding in modern appliance lines is commonly associated with 2009 and newer cycles.' }
    ]
  }
};

function findHvacBrand(normalizedQuery) {
  for (const cfg of HVAC_SERIAL_CONFIG) {
    for (const alias of cfg.aliases) {
      const re = new RegExp(`\\b${alias}\\b`, 'i');
      if (re.test(normalizedQuery)) return cfg;
    }
  }
  return null;
}

function resolveFullYear(yy) {
  const yearNum = parseInt(yy, 10);
  const currentTwo = new Date().getFullYear() % 100;
  return (yearNum > currentTwo ? 1900 : 2000) + yearNum;
}

function normalizeBrandKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '');
}

function applyHvacEraHints(base, normalizedQuery) {
  const out = { ...base };
  const brandKey = normalizeBrandKey(out.brand);
  const era = HVAC_ERA_DATA[brandKey];
  if (!era) return out;

  const matched = [];
  for (const rule of era.rules) {
    const re = new RegExp(`\\b${rule.key}\\b`, 'i');
    if (re.test(normalizedQuery)) matched.push(rule);
  }

  const noteParts = [];
  if (out.notes) noteParts.push(out.notes);
  noteParts.push(era.defaultNote);
  matched.forEach((m) => noteParts.push(m.note));
  out.notes = noteParts.join(' ');

  // Preserve precise serial-derived estimatedYear; add/override broader production window when era hints match.
  if (matched.length > 0) {
    out.yearRange = matched.map((m) => m.yearRange).filter(Boolean).join(' / ');
  } else if (!out.yearRange && era.defaultNote) {
    out.yearRange = out.yearRange || null;
  }

  return out;
}

function applyApplianceEraHints(base, normalizedQuery) {
  const out = { ...base };
  const brandKey = normalizeBrandKey(out.brand);
  const era = APPLIANCE_ERA_DATA[brandKey];
  if (!era) return out;

  const matched = [];
  for (const rule of era.rules) {
    const escaped = rule.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(normalizedQuery)) matched.push(rule);
  }

  const noteParts = [];
  if (out.notes) noteParts.push(out.notes);
  noteParts.push(era.defaultNote);
  matched.forEach((m) => noteParts.push(m.note));
  out.notes = noteParts.join(' ');

  if (matched.length > 0) {
    out.yearRange = matched.map((m) => m.yearRange).filter(Boolean).join(' / ');
  } else if (!out.yearRange) {
    out.yearRange = out.yearRange || null;
  }

  return out;
}

function applyNintendoSwitch2Hints(base, normalizedQuery) {
  const out = { ...base };
  const brandKey = normalizeBrandKey(out.brand);
  const queryText = String(normalizedQuery || '');
  const modelText = String(out.model || '').toLowerCase();
  const notesText = String(out.notes || '').toLowerCase();
  const rangeText = String(out.yearRange || '').toLowerCase();
  const isSwitch2 =
    /\bswitch\s*2\b/.test(queryText) ||
    /\bns2\b/.test(queryText) ||
    (brandKey === 'nintendo' && /\bswitch\s*2\b/.test(modelText)) ||
    /\bswitch\s*2\b/.test(notesText) ||
    /\bswitch\s*2\b/.test(rangeText);

  if (!isSwitch2) return out;

  const currentGenLabel = 'Current Generation (Released late 2025)';
  const serialRuleText = 'Nintendo Switch 2 serial numbers typically follow the new 14-digit alphanumeric standard used for modern Nintendo hardware.';

  if (!out.brand || String(out.brand).toLowerCase() === 'unknown') out.brand = 'Nintendo';
  if (!out.model) out.model = 'Switch 2';

  out.yearRange = currentGenLabel;
  if (!out.estimatedYear || /not yet released/i.test(String(out.estimatedYear))) {
    out.estimatedYear = '2025';
  }

  out.notes = String(out.notes || '').replace(/not yet released/ig, 'released late 2025').trim();
  if (!out.notes) {
    out.notes = 'Nintendo Switch 2 is the current generation, released in late 2025.';
  } else if (!/released late 2025/i.test(out.notes)) {
    out.notes += ' Nintendo Switch 2 is the current generation, released in late 2025.';
  }

  if (!out.serialRule) {
    out.serialRule = serialRuleText;
  } else if (!/14-digit alphanumeric/i.test(String(out.serialRule))) {
    out.serialRule = `${out.serialRule} ${serialRuleText}`;
  }

  return out;
}

function applyEraHints(base, normalizedQuery) {
  return applyNintendoSwitch2Hints(
    applyApplianceEraHints(
      applyHvacEraHints(base, normalizedQuery),
      normalizedQuery
    ),
    normalizedQuery
  );
}

function decodeHvacSerial(query, normalizedQuery) {
  const cfg = findHvacBrand(normalizedQuery);
  if (!cfg) return null;

  if (cfg.type === 'yyMM') {
    const match = query.match(/(?:^|\D)(\d{2})(\d{2})/);
    if (!match) return null;
    const yy = match[1];
    const mm = match[2];
    if (!/^\d{2}$/.test(yy) || !/^\d{2}$/.test(mm)) return null;
    const monthName = HVAC_MONTHS[mm];
    if (!monthName) return null;
    const fullYear = resolveFullYear(yy);
    return applyHvacEraHints({
      brand: cfg.brand,
      estimatedYear: String(fullYear),
      notes: `Month: ${monthName} (code ${mm}). Source: Manufacturer Technical Specifications.`,
      serialRule: `${cfg.brand}: first two digits are year, next two digits are month (YYMM). Source: Manufacturer Technical Specifications.`,
      yearRange: null
    }, normalizedQuery);
  }

  if (cfg.type === 'wwYY') {
    const match = query.match(/(?:^|\D)(\d{2})(\d{2})/);
    if (!match) return null;
    const ww = match[1];
    const yy = match[2];
    const week = parseInt(ww, 10);
    if (week < 1 || week > 53) return null;
    const fullYear = resolveFullYear(yy);
    return applyHvacEraHints({
      brand: cfg.brand,
      estimatedYear: String(fullYear),
      notes: `Week: ${ww} (production week). Source: Manufacturer Technical Specifications.`,
      serialRule: `${cfg.brand}: first two digits are week, next two digits are year (WWYY). Source: Manufacturer Technical Specifications.`,
      yearRange: null
    }, normalizedQuery);
  }

  if (cfg.type === 'letterWWYY') {
    const match = query.match(/[A-Za-z](\d{2})(\d{2})/);
    if (!match) return null;
    const ww = match[1];
    const yy = match[2];
    const week = parseInt(ww, 10);
    if (week < 1 || week > 53) return null;
    const fullYear = resolveFullYear(yy);
    return applyHvacEraHints({
      brand: cfg.brand,
      estimatedYear: String(fullYear),
      notes: `Week: ${ww} (from 4 digits after letter). Source: Manufacturer Technical Specifications.`,
      serialRule: `${cfg.brand}: 4 digits following a letter represent week and year (WWYY). Source: Manufacturer Technical Specifications.`,
      yearRange: null
    }, normalizedQuery);
  }

  return null;
}

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
      return res.status(429).json({ error: 'Too many requests. Please try again later.', errorCode: 'RATE_LIMIT' });
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
      return res.status(200).json(applyEraHints(cached, normalizedQuery));
    }
  } catch (_) {
    // Cache miss or unavailable — proceed to AI
  }

  // ── API key ───────────────────────────────────────────────────────────────
  // HVAC Serial Quick Decode — bypass AI when pattern matches
  const hvacQuick = decodeHvacSerial(sanitizedQuery, normalizedQuery);
  if (hvacQuick) {
    const result = {
      brand: hvacQuick.brand,
      model: null,
      estimatedYear: hvacQuick.estimatedYear,
      yearRange: hvacQuick.yearRange || null,
      specificityLevel: 'specific',
      inventionSummary: null,
      refinementSuggestion: 'For the most accurate results, enter the full serial number and model number from the rating plate.',
      notes: hvacQuick.notes,
      serialLocation: null,
      serialRule: hvacQuick.serialRule,
      exampleModelNumber: null,
      suggestedModelNumbers: []
    };
    try {
      await redis.set(queryCacheKey, result, { ex: 14 * 24 * 60 * 60 });
    } catch (_) {}
    return res.status(200).json(result);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Service unavailable' });
  }

  const prompt = `You are a product research specialist. Given the following appliance, electronics, or equipment model number, brand, or description, determine the most likely manufacture date or production era.

Research approach:
- Identify the brand and model from the query
- Determine when this model was first manufactured or sold
- Look for earliest known references: product launches, first reviews, first retail listings, manual publication dates
- If an exact year cannot be determined, provide a production year range
- Consider model number patterns that indicate year/generation
- Apply these HVAC era mappings when relevant:
  - Carrier: Round cabinet is generally pre-1980; Square cabinet is generally post-1980.
  - Rheem/Ruud: Classic series generally maps to earlier windows; Prestige series generally maps to newer windows.
  - Goodman: Janitrol legacy branding generally indicates pre-2000 equipment.
  - Trane: XE series generally maps to 1990-2009; XR series maps to 2000-present.
  - York: Affinity and Latitude series commonly map to 2005-2015 cycles.
- Apply these appliance-era mappings when relevant:
  - Whirlpool washers: Direct Drive is generally 1980s-2010; Vertical Modular (VMW) is generally 2010-present.
  - GE: Profile and Monogram follow different production windows; Camelback console styling indicates older legacy generations.
  - Samsung washers: VRT indicates post-2006 era; AddWash indicates post-2016 era.
  - LG washers: Inverter DirectDrive branding aligns with cycles starting in 2009.
- Apply this Nintendo-console mapping when relevant:
  - Nintendo Switch 2 is current generation and released in late 2025 (do not classify it as unreleased).
  - Mention that Switch 2 serial numbers typically follow a modern 14-digit alphanumeric standard.

IMPORTANT — Generic category queries:
- If the query is ONLY a product category with no brand or model (e.g. "refrigerator", "washer", "dryer", "water heater", "tv", "television", "microwave", "dishwasher", "laptop", "printer", "phone", "tablet", "air conditioner", "freezer", "range", "oven"):
  - Set specificityLevel to "generic"
  - Set inventionSummary to a 1-2 sentence description of when this product category was first invented or commercially introduced and by whom
  - Set refinementSuggestion to a helpful prompt asking the user to specify a brand and model number for more accurate results
  - Set estimatedYear and yearRange to null (no specific product to date)
  - Do NOT say the query is "too generic" or refuse to respond — always return the invention history
- If the query includes a brand but no model number: set specificityLevel to "brand-only"
- If the query includes a specific model number: set specificityLevel to "specific"
- refinementSuggestion is ALWAYS required regardless of specificityLevel

Query: "${sanitizedQuery}"

Respond with ONLY valid JSON in this exact format:
{
  "brand": "Brand name or Unknown",
  "model": "Model number if identifiable",
  "estimatedYear": "Most likely manufacture year or null",
  "yearRange": "e.g. 2015-2018 or null",
  "specificityLevel": "generic | brand-only | specific",
  "inventionSummary": "1-2 sentences on when this product category was first invented/introduced — required when specificityLevel is generic, null otherwise",
  "refinementSuggestion": "Always present — suggest how user can get more accurate results (e.g. enter brand + model number)",
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

    const result = applyEraHints(JSON.parse(text), normalizedQuery);

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
