/**
 * Production deterministic normalization of Serper's structured `date` field
 * (e.g. "2 years ago", "1 day ago", "Sep 8, 2023", "May 2025") into an
 * absolute year, anchored to a reference date. This runs entirely in code,
 * before any evidence reaches Gemini — Gemini never performs this arithmetic
 * and never assigns a relative date to a candidate year.
 *
 * Only handles Serper's own structured date field, which is short and
 * pattern-shaped. Free-text dates embedded inside a title/snippet body still
 * require Gemini's text understanding to locate (per the evidence-extraction
 * schema's `approximateYear` field) — this module does not attempt to regex
 * arbitrary prose, only Serper's own date-field conventions.
 */

const MONTH_NAMES = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

/**
 * @param {string|null|undefined} rawText
 * @param {Date} [referenceDate] injectable for deterministic testing
 * @returns {{year: number|null, precision: 'day'|'week'|'month'|'year'|null, raw: string|null}}
 */
export function normalizeRelativeDate(rawText, referenceDate = new Date()) {
  const raw = rawText == null ? null : String(rawText).trim();
  if (!raw) return { year: null, precision: null, raw };

  let m;

  if (/^yesterday$/i.test(raw)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - 1);
    return { year: d.getFullYear(), precision: 'day', raw };
  }

  if ((m = raw.match(/^(\d+)\s*day(s)?\s*ago$/i))) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - Number(m[1]));
    return { year: d.getFullYear(), precision: 'day', raw };
  }

  if ((m = raw.match(/^(\d+)\s*week(s)?\s*ago$/i))) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - Number(m[1]) * 7);
    return { year: d.getFullYear(), precision: 'week', raw };
  }

  if ((m = raw.match(/^(\d+)\s*month(s)?\s*ago$/i))) {
    const d = new Date(referenceDate);
    d.setMonth(d.getMonth() - Number(m[1]));
    return { year: d.getFullYear(), precision: 'month', raw };
  }

  if ((m = raw.match(/^(\d+)\s*year(s)?\s*ago$/i))) {
    const d = new Date(referenceDate);
    d.setFullYear(d.getFullYear() - Number(m[1]));
    return { year: d.getFullYear(), precision: 'year', raw };
  }

  // ISO date: 2023-09-08
  if ((m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    return { year: Number(m[1]), precision: 'day', raw };
  }

  // "September 8, 2023" / "Sep 8 2023" / "Sep. 8, 2023"
  const monthDayYear = new RegExp(`\\b(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i');
  if ((m = raw.match(monthDayYear))) {
    return { year: Number(m[3]), precision: 'day', raw };
  }

  // "May 2025" / "May, 2025"
  const monthYear = new RegExp(`\\b(${MONTH_NAMES})[a-z]*\\.?,?\\s+(\\d{4})\\b`, 'i');
  if ((m = raw.match(monthYear))) {
    return { year: Number(m[2]), precision: 'month', raw };
  }

  // Bare 4-digit year, the entire field (avoid matching year-like numbers
  // embedded in unrelated short codes by requiring the whole trimmed string).
  if ((m = raw.match(/^(19|20)\d{2}$/))) {
    return { year: Number(m[0]), precision: 'year', raw };
  }

  return { year: null, precision: null, raw };
}
