// Pure helper logic for the RCV/ACV result-CTA linkout feature. No DOM, no I/O — safe to
// unit test directly and safe to import from the browser-facing rcv-acv-linkout.js.
//
// Age rule: an age is only ever produced when a single, defensible manufacture/estimate
// year exists. Ambiguous, repeating-cycle, range-based, or unsupported results never
// produce a guessed or midpoint age.

// Stable dataset ids from lib/calculators/rcv-acv-items.js, duplicated here as literals
// because rcv-acv-items.js's CONFIRMED_ITEMS ids are derived (slugify(group-item)) and
// this module intentionally stays free of any dependency that could pull in the wider
// calculator UI. The RCV/ACV calculator itself always re-validates against its own
// dataset (see rcv-acv-calculator.js's applyQueryPrefill), so a stale id here simply
// fails to preselect rather than selecting the wrong item.
export const RCV_ACV_ITEM_IDS = {
  REFRIGERATOR: 'kitchen-appliances-refrigerator',
  DISHWASHER: 'kitchen-appliances-dishwasher',
  WASHER: 'laundry-washing-machine',
  ELECTRIC_DRYER: 'laundry-electric-dryer',
  GAS_DRYER: 'laundry-gas-dryer',
  MICROWAVE: 'kitchen-appliances-microwave-oven',
  CENTRAL_AC: 'hvac-heating-cooling-central-air-conditioner',
  HEAT_PUMP: 'hvac-heating-cooling-heat-pump-air-to-air',
  WATER_HEATER: 'water-heaters-plumbing-water-heater-electric-gas-or-oil',
  TANKLESS_WATER_HEATER: 'water-heaters-plumbing-tankless-water-heater',
  GARBAGE_DISPOSAL: 'kitchen-appliances-garbage-disposal',
};

export function parseCandidateYears(text) {
  const matches = String(text || '').match(/\b(19|20)\d{2}\b/g) || [];
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const year = parseInt(m, 10);
    if (!seen.has(year)) {
      seen.add(year);
      out.push(year);
    }
  }
  return out;
}

// Same definition script.js uses for "is this a single, unambiguous year" (a clean
// 4-digit year and nothing else — not a slash-joined cycle, not an "X or Y" string).
export function hasSingleResolvedYear(text) {
  const years = parseCandidateYears(text);
  return years.length === 1 && /^\d{4}$/.test(String(text || '').trim());
}

export function ageFromYear(year, currentYear = new Date().getFullYear()) {
  const age = currentYear - year;
  return age >= 0 ? age : null;
}

export function isCleanSingleYear(value) {
  return /^(19|20)\d{2}$/.test(String(value === undefined || value === null ? '' : value).trim());
}

export function matchRcvAcvItemFromCategoryText(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;

  if (/\btankless\b/.test(t) && /\bwater heaters?\b/.test(t)) return RCV_ACV_ITEM_IDS.TANKLESS_WATER_HEATER;
  if (/\bwater heaters?\b/.test(t)) return RCV_ACV_ITEM_IDS.WATER_HEATER;

  if (/\bdishwashers?\b/.test(t)) return RCV_ACV_ITEM_IDS.DISHWASHER;

  // Word-boundary matching means "\bwashers?\b" does not match inside "dishwasher".
  if (/\bwashers?\b/.test(t) || /\bwashing machines?\b/.test(t)) return RCV_ACV_ITEM_IDS.WASHER;

  if (/\belectric dryers?\b/.test(t)) return RCV_ACV_ITEM_IDS.ELECTRIC_DRYER;
  if (/\bgas dryers?\b/.test(t)) return RCV_ACV_ITEM_IDS.GAS_DRYER;
  // A bare "dryer" with no fuel qualifier is intentionally left unmapped — no evidence
  // to choose between the gas and electric confirmed items.

  if (/\bmicrowaves?\b/.test(t) && !/\bbuilt-?in\b/.test(t)) return RCV_ACV_ITEM_IDS.MICROWAVE;

  if (/\bcentral\b/.test(t) && (/\bair conditioners?\b/.test(t) || /\bac\b/.test(t))) {
    return RCV_ACV_ITEM_IDS.CENTRAL_AC;
  }

  if (/\bheat pumps?\b/.test(t)) return RCV_ACV_ITEM_IDS.HEAT_PUMP;

  if (/\bgarbage disposals?\b/.test(t) || /\bdisposals?\b/.test(t)) return RCV_ACV_ITEM_IDS.GARBAGE_DISPOSAL;

  if (/\brefrigerators?\b/.test(t) || /\bfridges?\b/.test(t)) {
    // "Compact/Mini/Built-In Refrigerator" and "Built-In Wine Cooler" are their own,
    // differently-rated confirmed items — don't collapse them into plain Refrigerator.
    if (/\bmini\b/.test(t) || /\bcompact\b/.test(t) || /\bbuilt-?in\b/.test(t) || /\bwine\b/.test(t)) return null;
    return RCV_ACV_ITEM_IDS.REFRIGERATOR;
  }

  return null;
}

// decoder-data.js's `products` field is uniform ("Water Heater (tank)") across every
// brand in the Water Heaters category — the only category where a category-level mapping
// is unambiguous without resolving the exact brand/decoder in use. Appliances, HVAC, and
// Electronics each mix multiple distinct product types within the same brand (e.g. a
// single appliance brand covers refrigerators, dishwashers, washers, dryers, ranges, and
// ovens), so mapping from category alone would be a guess and is intentionally skipped —
// those results still get the CTA, just without ?item.
export function mapDecoderCategoryToItemId(category) {
  if (category === 'waterHeaters') return RCV_ACV_ITEM_IDS.WATER_HEATER;
  return null;
}

export function buildRcvAcvUrl(opts) {
  const params = new URLSearchParams();
  if (opts.age !== null && opts.age !== undefined) params.set('age', String(opts.age));
  if (opts.item) params.set('item', opts.item);
  params.set('source', opts.source);
  if (opts.basis) params.set('basis', opts.basis);
  return `/rcv-acv-calculator?${params.toString()}`;
}
