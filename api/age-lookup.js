import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import {
  extractLocalModelAgeLookupTerms,
  findCloseLocalModelAgeCandidates,
  findExactLocalModelAgeMatch,
  formatLocalModelAgeMatch,
  inferLocalModelAgeBrand,
  loadLocalModelAgeDb,
  normalizeModelNumber
} from '../lib/model-age-db.js';

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
  frigidaire: {
    defaultNote: 'Frigidaire model-prefix heuristic: TF-prefix lines indicate pre-1985 production; FRT/FEF lines span 1985-2005; FFCO compact-freezer evidence can point to early-2000s production; FEFL lines span 1998-2010; FFEF/FFTR/FFSS lines indicate 2005-present.',
    rules: [
      { key: 'fefl', yearRange: '1998-2010', note: 'Frigidaire FEFL freestanding electric range models are generally associated with 1998-2010 production.' },
      { key: 'ffco', yearRange: '2000-2004', note: 'Frigidaire FFCO compact-freezer model evidence is associated with early-2000s production.' },
      { key: 'ffef', yearRange: '2005-2015', note: 'Frigidaire Gallery FFEF electric range models are generally associated with 2005-2015 production.' },
      { key: 'fef',  yearRange: '1994-2006', note: 'Frigidaire FEF electric range models are generally associated with 1994-2006 production.' },
      { key: 'frt',  yearRange: '1985-2005', note: 'Frigidaire FRT refrigerator models are generally associated with 1985-2005 production.' },
      { key: 'fghb', yearRange: '2008-2018', note: 'Frigidaire Gallery FGHB French door models are generally associated with 2008-2018 production.' },
      { key: 'fftr', yearRange: '2008-2022', note: 'Frigidaire FFTR top-mount refrigerator models are generally associated with 2008-2022 production.' },
      { key: 'ffss', yearRange: '2006-2018', note: 'Frigidaire FFSS side-by-side models are generally associated with 2006-2018 production.' },
    ]
  },
  whirlpool: {
    defaultNote: 'Whirlpool washer-era heuristic: Direct Drive platforms are generally older; Vertical Modular platforms are newer.',
    rules: [
      { key: 'direct drive', yearRange: '1980s-2010', note: 'Whirlpool Direct Drive washer platforms are commonly associated with 1980s through around 2010.' },
      { key: 'vertical modular', yearRange: '2010-Present', note: 'Whirlpool Vertical Modular washer platforms are commonly associated with 2010 and newer production.' },
      { key: 'vmw', yearRange: '2010-Present', note: 'Whirlpool VMW (Vertical Modular Washer) architecture generally aligns with 2010 and newer production.' }
    ]
  },
  ge: {
    defaultNote: 'GE family heuristic: Profile and Monogram lines follow different premium/flagship timelines; GTS/GTH top-mount refrigerator families generally point to post-2005 production; legacy Camelback consoles indicate older GE washer generations.',
    rules: [
      { key: 'profile', yearRange: '2000-Present', note: 'GE Profile lines are generally modern-era production (commonly 2000 and newer).' },
      { key: 'monogram', yearRange: '1990s-Present', note: 'GE Monogram lines are generally premium long-running production, commonly from the late 1990s onward.' },
      { key: 'gth', yearRange: '2005-2016', note: 'GE GTH top-mount refrigerator models are generally associated with post-2005 production cycles.' },
      { key: 'gts', yearRange: '2005-Present', note: 'GE GTS top-mount refrigerator models are generally associated with post-2005 production cycles.' },
      { key: 'camelback', yearRange: 'Pre-2000', note: 'GE Camelback console styling generally indicates older, pre-2000 era washer design.' },
      { key: 'pfsf', yearRange: '2005-2015', note: 'GE PFSF french door refrigerator models are generally associated with 2005-2015 production cycles.' },
      { key: 'pfss', yearRange: '2004-2014', note: 'GE PFSS side-by-side refrigerator models are generally associated with 2004-2014 production cycles.' },
      { key: 'pfe', yearRange: '2012-Present', note: 'GE Profile PFE french door refrigerator models are generally associated with 2012 and newer production.' },
      { key: 'pds', yearRange: '2000-2012', note: 'GE Profile PDS french door refrigerator models are generally associated with 2000-2012 production cycles.' },
      { key: 'gfe', yearRange: '2012-Present', note: 'GE GFE french door refrigerator models are generally associated with 2012 and newer production.' },
      { key: 'gss', yearRange: '2000-2015', note: 'GE GSS side-by-side refrigerator models are generally associated with 2000-2015 production cycles.' },
      { key: 'gse', yearRange: '2010-Present', note: 'GE GSE side-by-side refrigerator models are generally associated with 2010 and newer production.' },
      { key: 'jwre', yearRange: '2005-2015', note: 'GE JWRE wall oven models are generally associated with 2005-2015 production cycles.' },
      { key: 'jgbs', yearRange: '2005-Present', note: 'GE JGBS freestanding gas range models are generally associated with 2005 and newer production.' },
      { key: 'jbs', yearRange: '2005-Present', note: 'GE JBS freestanding electric range models are generally associated with 2005 and newer production.' },
      { key: 'hps', yearRange: '1999-2011', note: 'Hotpoint HPS side-by-side refrigerator models are generally associated with 1999-2011 production cycles.' },
      { key: 'hss', yearRange: '1999-2011', note: 'Hotpoint HSS side-by-side refrigerator models are generally associated with 1999-2011 production cycles.' },
      { key: 'hpr', yearRange: '1995-2010', note: 'Hotpoint HPR top-mount refrigerator models are generally associated with 1995-2010 production cycles.' },
      { key: 'htr', yearRange: '1995-2010', note: 'Hotpoint HTR top-mount refrigerator models are generally associated with 1995-2010 production cycles.' }
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
  },
  kitchenaid: {
    defaultNote: 'KitchenAid model heuristic: KFIS/KRFF/KRFC refrigerator lines are generally post-2010; Architect Series II lines are generally 2005-2015.',
    rules: [
      { key: 'kfis', yearRange: '2010-Present', note: 'KitchenAid KFIS French door refrigerator models are generally associated with 2010 and newer production.' },
      { key: 'krff', yearRange: '2014-Present', note: 'KitchenAid KRFF French door refrigerator models are generally associated with 2014 and newer production.' },
      { key: 'krfc', yearRange: '2014-Present', note: 'KitchenAid KRFC counter-depth refrigerator models are generally associated with 2014 and newer production.' },
      { key: 'architect series ii', yearRange: '2005-2015', note: 'KitchenAid Architect Series II appliances are generally associated with 2005-2015 production.' },
      { key: 'architect series', yearRange: '2000-2010', note: 'KitchenAid Architect Series appliances are generally associated with 2000-2010 production.' }
    ]
  },
  jenn_air: {
    defaultNote: 'Jenn-Air model heuristic: JFI/JFC refrigerator lines are generally post-2008; older JCD column units are pre-2016.',
    rules: [
      { key: 'jfi', yearRange: '2008-2018', note: 'Jenn-Air JFI French door refrigerator models are generally associated with 2008-2018 production.' },
      { key: 'jfc', yearRange: '2010-Present', note: 'Jenn-Air JFC counter-depth refrigerator models are generally associated with 2010 and newer production.' },
      { key: 'pro-style', yearRange: '2005-Present', note: 'Jenn-Air Pro-Style appliances are generally modern-era production.' },
      { key: 'rise', yearRange: '2019-Present', note: 'Jenn-Air RISE collection appliances are associated with 2019 and newer production.' },
      { key: 'noir', yearRange: '2019-Present', note: 'Jenn-Air NOIR collection appliances are associated with 2019 and newer production.' }
    ]
  },
  amana: {
    defaultNote: 'Amana model heuristic: Post-2006 Amana is a Whirlpool brand; AFI/ASI refrigerator lines are generally 2006-2016.',
    rules: [
      { key: 'afi', yearRange: '2006-2016', note: 'Amana AFI French door refrigerator models are generally associated with 2006-2016 production.' },
      { key: 'art', yearRange: '2008-Present', note: 'Amana ART top-mount refrigerator models are generally associated with 2008 and newer production.' },
      { key: 'asi', yearRange: '2006-2016', note: 'Amana ASI side-by-side refrigerator models are generally associated with 2006-2016 production.' }
    ]
  },
  admiral: {
    defaultNote: 'Admiral model heuristic: Post-2006 Admiral is a Whirlpool/Maytag brand; models are generally entry-level.',
    rules: [
      { key: 'atw', yearRange: '2006-2016', note: 'Admiral ATW top-load washer models are generally associated with 2006-2016 production.' }
    ]
  },
  electrolux: {
    defaultNote: 'Electrolux model heuristic: ELFW/ELTF laundry lines are generally post-2010; EI/EW refrigerator lines are generally post-2012.',
    rules: [
      { key: 'elfw', yearRange: '2010-Present', note: 'Electrolux ELFW front-load washer models are generally associated with 2010 and newer production.' },
      { key: 'eltf', yearRange: '2010-Present', note: 'Electrolux ELTF dryer models are generally associated with 2010 and newer production.' },
      { key: 'perfect steam', yearRange: '2012-Present', note: 'Electrolux Perfect Steam laundry appliances are generally associated with 2012 and newer production.' },
      { key: 'luxcare', yearRange: '2015-Present', note: 'Electrolux LuxCare wash system is generally associated with 2015 and newer production.' }
    ]
  },
  bradford_white: {
    defaultNote: 'Bradford White model heuristic: MI-series power vent and RG-series atmospheric vent are common modern lines.',
    rules: [
      { key: 'mi', yearRange: '2008-Present', note: 'Bradford White MI-series power vent water heaters are generally associated with 2008 and newer production.' },
      { key: 'rg', yearRange: '2005-Present', note: 'Bradford White RG-series gas water heaters are generally associated with 2005 and newer production.' },
      { key: 're', yearRange: '2005-Present', note: 'Bradford White RE-series electric water heaters are generally associated with 2005 and newer production.' },
      { key: 'defender safety system', yearRange: '2003-Present', note: 'Bradford White Defender Safety System is associated with 2003 and newer production.' }
    ]
  },
  speed_queen: {
    defaultNote: 'Speed Queen model heuristic: TR/TC top-load and FR/FC front-load laundry lines are modern; commercial-grade heritage spans decades.',
    rules: [
      { key: 'awn', yearRange: '2006-Present', note: 'Speed Queen AWN top-load washer models are generally associated with 2006 and newer production.' },
      { key: 'afn', yearRange: '2006-Present', note: 'Speed Queen AFN front-load washer models are generally associated with 2006 and newer production.' },
      { key: 'tr', yearRange: '2018-Present', note: 'Speed Queen TR-series top-load washer models are generally associated with 2018 and newer production.' },
      { key: 'tc', yearRange: '2020-Present', note: 'Speed Queen TC-series commercial top-load washer models are generally associated with 2020 and newer production.' }
    ]
  },
  sub_zero: {
    defaultNote: 'Sub-Zero model heuristic: BI (Built-In) series spans decades; newer 700 and Classic series lines generally post-2015.',
    rules: [
      { key: '700', yearRange: '2015-Present', note: 'Sub-Zero 700 series refrigerators are generally associated with 2015 and newer production.' },
      { key: 'classic', yearRange: '2018-Present', note: 'Sub-Zero Classic series refrigerators are generally associated with 2018 and newer production.' },
      { key: 'bi-', yearRange: '1995-Present', note: 'Sub-Zero BI (Built-In) series spans a long production window; decade resolution requires physical inspection.' },
      { key: 'pro 48', yearRange: '2000-Present', note: 'Sub-Zero Pro 48 series refrigerators are generally associated with 2000 and newer production.' }
    ]
  }
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const TODAY_READABLE = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
const LOCAL_DB_STRONG_CANDIDATE_CONFIDENCE = 0.85;
const LOCAL_DB_SCAN_CONFIDENCE = 0.6;
const LOCAL_DB_MIN_UNBRANDED_ALIAS_LENGTH = 5;

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

function normalizeCategoryKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeKnownItemQuery(query) {
  const text = String(query || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return '';

  if (/\blr3re(?:-\d+)?\b/.test(normalized) && !/\blitter[\s-]*robot\b/.test(normalized)) {
    return `${text} Whisker Litter-Robot 3 Open Air self-cleaning litter box`;
  }

  if (/\blitter[\s-]*robot\b/.test(normalized) && !/\bwhisker\b/.test(normalized)) {
    return `${text} by Whisker`;
  }

  // Strip "serial XXXXXXX" suffix added by auto-populate
  const strippedSerial = text.replace(/\s+serial\s+\S+$/i, '').trim();
  if (strippedSerial && strippedSerial !== text) {
    return strippedSerial;
  }

  return text;
}

function shouldReturnLocalExactMatch(match, matchedTerm, inferredBrand) {
  if (!match) return false;
  if (match.matchType === 'normalized-exact') return true;

  // Short family aliases like "C3" are too ambiguous unless the brand is explicit.
  return Boolean(inferredBrand) || normalizeModelNumber(matchedTerm).length >= LOCAL_DB_MIN_UNBRANDED_ALIAS_LENGTH;
}

function shouldReturnLocalStrongCandidate(candidate, matchedTerm, inferredBrand) {
  const normalizedTerm = normalizeModelNumber(matchedTerm);
  if (!candidate || !normalizedTerm) return false;

  if (candidate.matchType === 'normalized-exact') return true;
  if (candidate.matchType === 'alias-exact') {
    return Boolean(inferredBrand) || normalizedTerm.length >= LOCAL_DB_MIN_UNBRANDED_ALIAS_LENGTH;
  }

  if (candidate.confidence < LOCAL_DB_STRONG_CANDIDATE_CONFIDENCE) return false;
  if (!inferredBrand && normalizedTerm.length < 6) return false;
  if (candidate.matchType === 'fuzzy' && candidate.metrics.bestDistance > 1) return false;
  if (candidate.matchType === 'prefix' && candidate.metrics.bestPrefix < 6) return false;
  if (candidate.metrics.bestDistance > 2 && !candidate.metrics.sharedTokens) return false;

  return candidate.matchType === 'contains' || candidate.matchType === 'prefix' || candidate.matchType === 'fuzzy';
}

async function findLocalModelAgeResult(sanitizedQuery, normalizedQuery) {
  const localDb = await loadLocalModelAgeDb();
  const records = Array.isArray(localDb.records) ? localDb.records : [];
  const inferredBrand = inferLocalModelAgeBrand(records, sanitizedQuery);
  const lookupTerms = extractLocalModelAgeLookupTerms(sanitizedQuery);

  if (!lookupTerms.length) return null;

  // Decision path:
  // 1. Return immediately on a safe exact local hit.
  // 2. Otherwise only return a candidate if confidence is strong enough.
  for (const lookupTerm of lookupTerms) {
    const exactMatch = findExactLocalModelAgeMatch(records, lookupTerm, inferredBrand);
    if (!shouldReturnLocalExactMatch(exactMatch, lookupTerm, inferredBrand)) continue;

    return applyEraHints(
      formatLocalModelAgeMatch(exactMatch.record, {
        confidence: 1,
        matchType: exactMatch.matchType
      }),
      normalizedQuery
    );
  }

  let bestCandidate = null;
  let bestLookupTerm = '';

  for (const lookupTerm of lookupTerms) {
    const [candidate] = findCloseLocalModelAgeCandidates(records, lookupTerm, inferredBrand, {
      minConfidence: LOCAL_DB_SCAN_CONFIDENCE,
      limit: 1
    });

    if (!candidate) continue;
    if (!bestCandidate || candidate.confidence > bestCandidate.confidence) {
      bestCandidate = candidate;
      bestLookupTerm = lookupTerm;
    }
  }

  if (!shouldReturnLocalStrongCandidate(bestCandidate, bestLookupTerm, inferredBrand)) {
    return null;
  }

  return applyEraHints(
    formatLocalModelAgeMatch(bestCandidate.record, {
      confidence: bestCandidate.confidence,
      matchType: bestCandidate.matchType
    }),
    normalizedQuery
  );
}

function applyHvacEraHints(base, normalizedQuery) {
  const out = { ...base };
  const brandKey = normalizeBrandKey(out.brand);
  const categoryKey = normalizeCategoryKey(out.itemCategory || out.category);
  if (categoryKey && !/(hvac|airconditioner|furnace|heatpump|condenser|airhandler|heater)/.test(categoryKey)) return out;
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
  const categoryKey = normalizeCategoryKey(out.itemCategory || out.category);
  // Guard: only skip if category is explicitly non-appliance (e.g. HVAC, electronics)
  if (categoryKey && /(hvac|airconditioner|furnace|heatpump|television|computer|laptop|phone|tablet)/.test(categoryKey)) return out;
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

  const currentGenLabel = 'Current Generation (Released June 5, 2025)';
  const serialRuleText = 'Nintendo Switch 2 serial numbers typically follow the new 14-digit alphanumeric standard used for modern Nintendo hardware.';

  if (!out.brand || String(out.brand).toLowerCase() === 'unknown') out.brand = 'Nintendo';
  if (!out.model) out.model = 'Switch 2';

  out.yearRange = currentGenLabel;
  if (!out.estimatedYear || /not yet released|unreleased|coming soon|upcoming/i.test(String(out.estimatedYear))) {
    out.estimatedYear = '2025';
  }

  out.notes = String(out.notes || '')
    .replace(/not yet released/ig, 'released June 5, 2025')
    .replace(/\bunreleased\b/ig, 'released June 5, 2025')
    .replace(/\bcoming soon\b/ig, 'released June 5, 2025')
    .replace(/\bupcoming\b/ig, 'released June 5, 2025')
    .trim();
  if (!out.notes) {
    out.notes = 'Nintendo Switch 2 is the current generation, released on June 5, 2025.';
  } else if (!/june 5,\s*2025/i.test(out.notes)) {
    out.notes += ' Nintendo Switch 2 is the current generation, released on June 5, 2025.';
  }

  if (!out.serialRule) {
    out.serialRule = serialRuleText;
  } else if (!/14-digit alphanumeric/i.test(String(out.serialRule))) {
    out.serialRule = `${out.serialRule} ${serialRuleText}`;
  }

  return out;
}

function applyIphone17Hints(base, normalizedQuery) {
  const out = { ...base };
  const brandKey = normalizeBrandKey(out.brand);
  const queryText = String(normalizedQuery || '');
  const modelText = String(out.model || '').toLowerCase();
  const notesText = String(out.notes || '').toLowerCase();
  const rangeText = String(out.yearRange || '').toLowerCase();
  const isIphone17 =
    /\biphone\s*17\b/.test(queryText) ||
    (brandKey === 'apple' && /\biphone\s*17\b/.test(modelText)) ||
    /\biphone\s*17\b/.test(notesText) ||
    /\biphone\s*17\b/.test(rangeText);

  if (!isIphone17) return out;

  if (!out.brand || String(out.brand).toLowerCase() === 'unknown') out.brand = 'Apple';
  if (!out.model) out.model = 'iPhone 17';
  out.yearRange = 'Current Generation (Released September 2025)';
  if (!out.estimatedYear || /not yet released/i.test(String(out.estimatedYear))) {
    out.estimatedYear = '2025';
  }
  out.notes = String(out.notes || '').replace(/not yet released/ig, 'released September 2025').trim();
  if (!out.notes) {
    out.notes = 'iPhone 17 launched in September 2025 as Apple\'s current-generation iPhone platform.';
  } else if (!/september 2025/i.test(out.notes)) {
    out.notes += ' iPhone 17 launched in September 2025.';
  }

  return out;
}

function applyEraHints(base, normalizedQuery) {
  return applyIphone17Hints(
    applyNintendoSwitch2Hints(
      applyApplianceEraHints(
        applyHvacEraHints(base, normalizedQuery),
        normalizedQuery
      ),
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

/**
 * Groq Fallback Provider
 * Retries with Groq if Gemini fails or is rate-limited.
 */
async function callGroq(prompt) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('Groq API key missing');

  const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

  const groqController = new AbortController();
  const groqTimeout = setTimeout(() => groqController.abort(), 12000);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a product research specialist. Return VALID JSON ONLY. Follow the requested schema exactly. No conversational text or markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    }),
    signal: groqController.signal
  });
  clearTimeout(groqTimeout);

  if (!response.ok) {
    const errText = await response.text().catch(() => '(unreadable)');
    throw new Error(`Groq error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned empty content');

  return JSON.parse(content);
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

  const sanitizedQuery = normalizeKnownItemQuery(query.trim());
  const normalizedQuery = sanitizedQuery.toLowerCase().replace(/\s+/g, ' ');
  const queryCacheKey = `age-lookup:v3:${normalizedQuery}`;

  // Local-first path:
  // - exact local matches return immediately
  // - only strong local candidates can override the remote fallback path
  // - ambiguous or broad queries continue into the existing cache / AI flow
  try {
    const localResult = await findLocalModelAgeResult(sanitizedQuery, normalizedQuery);
    if (localResult) {
      try {
        await redis.set(queryCacheKey, localResult, { ex: 14 * 24 * 60 * 60 });
      } catch (_) {}
      return res.status(200).json(localResult);
    }
  } catch (err) {
    console.error('[Smart Lookup] Local model age DB lookup failed, continuing to fallback path.', err.message);
  }

  // ── Decoder-verified lookup — check user-contributed model database ──
  try {
    const queryWords = sanitizedQuery.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const brands = ['whirlpool','ge','samsung','lg','carrier','goodman','rheem','trane',
      'frigidaire','maytag','kenmore','bosch','lennox','york','ruud','amana',
      'apple','sony','vizio','panasonic','hp','asus'];

    let detectedBrand = null;
    const lowerQuery = sanitizedQuery.toLowerCase();
    for (const b of brands) {
      if (lowerQuery.includes(b)) { detectedBrand = b.replace(/[^a-z0-9]/g,''); break; }
    }

    if (detectedBrand && queryWords.length > 0) {
      for (const word of queryWords) {
        if (word.length < 4) continue;
        const verifiedKey = `decoder-verified:${detectedBrand}:${word}`;
        const verifiedResult = await redis.get(verifiedKey);
        if (verifiedResult && verifiedResult.estimatedYear) {
          return res.status(200).json({
            ...verifiedResult,
            _source: 'decoder-verified',
            _fallbackUsed: false
          });
        }
      }
    }
  } catch (_) {}

  // ── Query-level cache (14-day TTL) ────────────────────────────────────────
  try {
    const cached = await redis.get(queryCacheKey);
    if (cached) {
      return res.status(200).json(applyEraHints(cached, normalizedQuery));
    }
  } catch (_) {
    // Cache miss or unavailable — proceed to AI
  }

  // ── HVAC Serial Quick Decode — bypass AI when pattern matches ─────────────
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
      suggestedModelNumbers: [],
      _source: 'static',
      _fallbackUsed: false
    };
    try {
      await redis.set(queryCacheKey, result, { ex: 14 * 24 * 60 * 60 });
    } catch (_) {}
    return res.status(200).json(result);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = `You are a product research specialist. Given the following appliance, electronics, or equipment model number, brand, or description, determine the most likely manufacture date or production era.

Today is ${TODAY_READABLE} (${TODAY_ISO}). Every answer must be accurate as of today's date. Do not describe any product as unreleased, upcoming, or not yet released if it was already released on or before today's date.

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
  - Frigidaire / Electrolux family: FFCO compact-freezer evidence can indicate early-2000s production; FEFL generally maps to 1998-2010; FFEF/FFTR/FFSS are newer families.
  - GE: Profile and Monogram follow different production windows; GTS/GTH top-mount refrigerators generally map to post-2005 production; Camelback console styling indicates older legacy generations.
  - Samsung washers: VRT indicates post-2006 era; AddWash indicates post-2016 era.
  - LG washers: Inverter DirectDrive branding aligns with cycles starting in 2009.
- Apply this Nintendo-console mapping when relevant:
  - Nintendo Switch 2 is current generation and released on June 5, 2025 (do not classify it as unreleased).
  - Mention that Switch 2 serial numbers typically follow a modern 14-digit alphanumeric standard.
- Apply this pet-tech mapping when relevant:
  - LR3RE-1000 is a Whisker Litter-Robot 3 Open Air self-cleaning litter box, not a generator or power product.
  - Litter-Robot queries should be identified as automatic litter boxes / pet-tech appliances.
- Apply this mobile-device mapping when relevant:
  - Apple iPhone 17 released in September 2025; classify it as current generation rather than unreleased.

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
  "estimatedYear": "Most likely manufacture year, or null if only a broad range is available",
  "yearRange": "e.g. 2015-2018 or 2012-2026 or null",
  "specificityLevel": "generic | brand-only | specific",
  "timeline": "For broad/generic searches: provide 2-4 key milestone years and generation names within the product line (e.g., '2012: S200E launch, 2016: Flip/Convertible (TP201), 2017: NanoEdge, 2025: AI models'). For specific complete model numbers, set to null.",
  "inventionSummary": "1-2 sentences on when this product category was first invented/introduced — required when specificityLevel is generic, null otherwise",
  "refinementSuggestion": "Always present — suggest how user can get more accurate results (e.g. enter full brand + model number for specific year)",
  "notes": "REQUIRED — Explain WHY this date range was chosen. For broad product families, note that the production window spans multiple decades with continuous annual refreshes and that the actual age depends on the specific model variant. State when the line was first introduced, major generation changes, and current production status. Always include at least one full sentence of reasoning.",
  "evidence": [{"detail": "One specific fact supporting the date (e.g. 'ASUS Vivobook 15 series launched in 2012, with continuous annual refreshes through 2026')", "source": "Source type (e.g. 'Product launch timeline', 'Model number pattern', 'Release cycle')"}],
  "serialLocation": "Brief description of where to physically find the serial number on this type of product (e.g. 'Back panel, lower-left sticker' or 'Inside door frame' or 'Bottom of device')",
  "serialRule": "One-sentence general rule for how to decode the serial number for this brand and product type, if known (e.g. 'Samsung TVs: character 8 encodes the year, character 9 the month' or 'Use the Serial Decoder tab above for precise dating' if a standard format is unknown)",
  "exampleModelNumber": "One specific real model number if the query is a generic description with no model number present (e.g. 'WRF535SWHZ' for 'Whirlpool French door refrigerator'). Set to null if the query already contains a model number or if suggestedModelNumbers is populated.",
  "suggestedModelNumbers": ["Array of 2-3 plausible complete model numbers only if the query looks like a partial or incomplete model number prefix. Set to empty array [] in all other cases. Never populate both this and exampleModelNumber at the same time."]
}

Rules for exampleModelNumber and suggestedModelNumbers:
- Query is a generic description (e.g. 'Whirlpool side-by-side refrigerator'): set exampleModelNumber to one real example model number; leave suggestedModelNumbers as [].
- Query looks like a partial model prefix (e.g. 'GE PFE' or 'WRF535'): set suggestedModelNumbers to 2-3 plausible complete model numbers; leave exampleModelNumber as null.
- Query is already a complete model number: set both exampleModelNumber to null and suggestedModelNumbers to [].`;

  let result = null;
  let source = 'gemini';
  let fallbackUsed = false;

  // ── Provider selection logic: Try Gemini first, fallback to Groq ─────────
  try {
    if (!apiKey) throw new Error('Gemini API key missing');

    const geminiController = new AbortController();
    const geminiTimeout = setTimeout(() => geminiController.abort(), 12000);
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
        }),
        signal: geminiController.signal
      }
    );
    clearTimeout(geminiTimeout);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '(unreadable)');
      throw new Error(`Gemini status ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty parts');

    result = JSON.parse(text);
  } catch (err) {
    console.error('[Smart Lookup] Gemini failed, attempting Groq fallback...', err.message);
    try {
      result = await callGroq(prompt);
      source = 'groq';
      fallbackUsed = true;
    } catch (groqErr) {
      console.error('[Smart Lookup] Groq fallback failed also', groqErr.message);
    }
  }

  // ── Return final result or safe fallback if both failed ──────────────────
  if (result) {
    const finalResult = applyEraHints(result, normalizedQuery);
    
    // ── Calculate estimatedYear from yearRange if estimatedYear is missing ──
    if ((!finalResult.estimatedYear || finalResult.estimatedYear === 'Unknown' || finalResult.estimatedYear === null) && finalResult.yearRange) {
      const yearsMatch = String(finalResult.yearRange).match(/(\d{4})/g);
      if (yearsMatch && yearsMatch.length >= 2) {
        const start = parseInt(yearsMatch[0], 10);
        const end = parseInt(yearsMatch[yearsMatch.length - 1], 10);
        const midpoint = Math.round((start + end) / 2);
        // Bias toward recent: if midpoint is .5, round up
        finalResult.estimatedYear = String(Math.ceil((start + end) / 2));
      }
    }
    
    finalResult._source = source;
    finalResult._fallbackUsed = fallbackUsed;

    // Write cache (14-day TTL)
    try {
      await redis.set(queryCacheKey, finalResult, { ex: 14 * 24 * 60 * 60 });
    } catch (_) {}

    // Brand cache — stable fields only (90-day TTL)
    if (finalResult.brand && finalResult.brand !== 'Unknown') {
      try {
        const brandKey = `brand-info:${finalResult.brand.toLowerCase().replace(/\s+/g, '_')}`;
        const brandData = {};
        if (finalResult.serialLocation) brandData.serialLocation = finalResult.serialLocation;
        if (finalResult.serialRule)     brandData.serialRule     = finalResult.serialRule;
        if (Object.keys(brandData).length > 0) {
          await redis.set(brandKey, brandData, { ex: 90 * 24 * 60 * 60 });
        }
      } catch (_) {}
    }

    return res.status(200).json(finalResult);
  } else {
    // Both providers failed — return valid structured response with safety message
    return res.status(200).json({
      errorCode: "AI_UNAVAILABLE",
      message: "Smart Lookup is temporarily unavailable. Please try again soon, or use the Serial Number Decoder.",
      _source: "none",
      _fallbackUsed: true
    });
  }
}

