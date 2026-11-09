/**
 * Evidence for ItemAssist Research (research.2): the sources behind a price or a specification, held to a strict schema.
 *
 * Nothing here is taken on a caller's word. The source class and the display name come from a fixed domain registry, the domain is
 * recomputed from the URL, the model relation is recomputed from the two model strings, and dates are real calendar dates. A source
 * on an unknown host is refused outright: a plausible-looking link is not a citation. Evidence nobody uses is dropped, never shown.
 */

import { SOURCE_CLASS, SOURCE_REGISTRY, STOREFRONT_LABELS, EXACT_HOST_ONLY, classifyHost } from '../serper/seller-hosts.js';
export { SOURCE_CLASS, SOURCE_REGISTRY, STOREFRONT_LABELS, EXACT_HOST_ONLY, classifyHost };
export const MODEL_RELATION = Object.freeze({ EXACT: 'EXACT', VARIANT: 'VARIANT', DIFFERENT: 'DIFFERENT', UNKNOWN: 'UNKNOWN' });
export const SUBJECTS = Object.freeze(['ORIGINAL', 'SUCCESSOR', 'ALT_1', 'ALT_2']);
export const FIRST_PARTY_CLASSES = Object.freeze([SOURCE_CLASS.MANUFACTURER, SOURCE_CLASS.RETAILER]);
export const MAX_EVIDENCE = 10;

const MAX_URL_CHARS = 300;
const MAX_MODEL_CHARS = 40;
// A model code, not free text: letters, digits and hyphens with at least one digit, optionally one short "/" suffix (RF28R7351SR/AA).
// No spaces, dots or other punctuation, so a link or a call to action cannot pass as a model.
export const MODEL_PATTERN = /^(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9][A-Za-z0-9-]{2,23}(?:\/[A-Za-z0-9]{1,6})?$/;
const ID_PATTERN = /^e[1-9]\d?$/;
/** The source URL reduced to origin + path (no query, fragment, credentials or port), or null when it is not an acceptable https link. */
export function safeSourceUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_CHARS || /[\u0000-\u001f\u007f\s]/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const known = classifyHost(url.hostname);
  return known ? { url: `${url.origin}${url.pathname}`, host: url.hostname.toLowerCase().replace(/^www\./, ''), ...known } : null;
}

/** A real calendar date as YYYY-MM-DD (a full ISO time with a zone is reduced to its UTC date), year 2000-2100; anything else is null. */
export function normalizeDate(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const time = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const text = day ? value : time && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString().slice(0, 10) : null;
  const parts = text && /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) return null;
  const [year, month, date] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const real = new Date(Date.UTC(year, month - 1, date));
  return year >= 2000 && year <= 2100 && real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === date ? text : null;
}

export const daysBetween = (earlier, later) => Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);

const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** EXACT when identical after normalising; VARIANT for a short regional or colour suffix (QN55Q80D vs QN55Q80DAFXZA); otherwise DIFFERENT. */
export function modelRelation(subject, expected) {
  const a = modelKey(subject), b = modelKey(expected);
  if (!a || !b) return MODEL_RELATION.UNKNOWN;
  if (a === b) return MODEL_RELATION.EXACT;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 6 && longer.startsWith(shorter) && longer.length - shorter.length <= 6 ? MODEL_RELATION.VARIANT : MODEL_RELATION.DIFFERENT;
}

const cleanModel = (value) => (typeof value === 'string' && MODEL_PATTERN.test(value.trim()) ? value.trim().slice(0, MAX_MODEL_CHARS) : null);

/**
 * Normalises raw evidence. The returned items carry only fields this function derived or validated; `rejections` lists, by fixed reason
 * code, what was refused (never the refused content).
 * @returns {{items: object[], rejections: {reason: string}[]}}
 */
export function normalizeEvidence(raw) {
  const items = [], rejections = [], seen = new Set();
  for (const entry of (Array.isArray(raw) ? raw : []).slice(0, MAX_EVIDENCE * 2)) {
    const refuse = (reason) => { rejections.push({ reason }); };
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !ID_PATTERN.test(String(entry.id)) || seen.has(entry.id) || !SUBJECTS.includes(entry.subject)) { refuse('SHAPE_INVALID'); continue; }
    const source = safeSourceUrl(entry.sourceUrl);
    if (!source) { refuse(typeof entry.sourceUrl === 'string' && /^https:\/\//i.test(entry.sourceUrl) ? 'SOURCE_NOT_ALLOWED' : 'SOURCE_INVALID'); continue; }
    // A claimed domain or class that disagrees with the URL is a sign of a forged citation.
    if (entry.sourceDomain !== undefined && String(entry.sourceDomain).toLowerCase().replace(/^www\./, '') !== source.host) { refuse('SOURCE_FABRICATED'); continue; }
    const published = entry.publishedAt == null ? null : normalizeDate(entry.publishedAt);
    const observed = entry.observedAt == null ? null : normalizeDate(entry.observedAt);
    if ((entry.publishedAt != null && !published) || (entry.observedAt != null && !observed)) { refuse('DATE_INVALID'); continue; }
    const subjectModel = entry.subjectModel == null ? null : cleanModel(entry.subjectModel);
    const expectedModel = entry.expectedModel == null ? null : cleanModel(entry.expectedModel);
    if ((entry.subjectModel != null && !subjectModel) || (entry.expectedModel != null && !expectedModel)) { refuse('SHAPE_INVALID'); continue; }
    seen.add(entry.id);
    items.push({
      id: entry.id, subject: entry.subject, sourceName: source.sourceName, sourceDomain: source.domain, sourceUrl: source.url, sourceClass: source.sourceClass,
      firstParty: FIRST_PARTY_CLASSES.includes(source.sourceClass), publishedAt: published, observedAt: observed, subjectModel, expectedModel,
      modelRelation: modelRelation(subjectModel, expectedModel),
    });
    if (items.length >= MAX_EVIDENCE) break;
  }
  return { items, rejections };
}

/** True for a name that looks like an exact model code (RF28B5100SR, WM4000HWB, LRFDS3006S) rather than a series or family (C4, S90D). */
export function looksLikeExactModel(name) {
  return /\b(?=[A-Z0-9-]*[A-Z])(?=(?:[A-Z0-9-]*\d){3})[A-Z0-9-]{6,}\b/.test(String(name || '').toUpperCase());
}
