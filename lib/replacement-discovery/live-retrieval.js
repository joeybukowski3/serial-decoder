import { createDeadline } from '../smart-lookup/deadline.js';
import { interpretReplacementSearch, NOTES_MODES } from './interpret.js';
import { searchProducts } from './providers/explicit-search.js';
import { fetchSource } from './providers/guarded-page-fetch.js';
import { runTvRetrieval, normalizeSupportedTvModel } from './retrieval-first.js';
import { runRefrigeratorRetrieval, normalizeSupportedRefrigeratorModel } from './refrigerator-retrieval.js';

export const DEFAULT_DEADLINE_MS = 20_000;
export const MAX_DEADLINE_MS = 60_000;
export const MAX_NOTES_LENGTH = 300;
export const MAX_FIELD_LENGTH = 40;

/**
 * Declared support matrix. Every entry is checked BEFORE any search or fetch; anything outside it is refused with
 * zero provider calls. Model patterns are limited to what the current extractors and rules can legitimately handle.
 */
const SUPPORT = Object.freeze({
  television: Object.freeze({
    Samsung: Object.freeze({
      models: 'Samsung QLED / Neo QLED: QN##Q## or QN##QN## (size 24-98) with generation letter R, C, D or F',
      noun: 'television',
      normalizeModel: normalizeSupportedTvModel,
      run: runTvRetrieval,
    }),
  }),
  refrigerator: Object.freeze({
    LG: Object.freeze({
      models: 'LG refrigerators: L + 1-5 letters + 2-5 digits + 2-6 letters/digits (for example LRFCS25D3S, LF25G8330S)',
      noun: 'refrigerator',
      normalizeModel: normalizeSupportedRefrigeratorModel,
      run: runRefrigeratorRetrieval,
    }),
  }),
});

export const SUPPORT_MATRIX = Object.freeze(Object.fromEntries(Object.entries(SUPPORT).map(([category, brands]) =>
  [category, Object.freeze(Object.fromEntries(Object.entries(brands).map(([brand, entry]) => [brand, entry.models])))])));

const CATEGORY_ALIASES = Object.freeze({ television: 'television', tv: 'television', refrigerator: 'refrigerator', fridge: 'refrigerator' });

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const clean = (value) => String(value).replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
const reject = (status, reasonCode) => ({ ok: false, status, reasonCode });

/**
 * Pure input check. Returns `{ ok: true, value }` or `{ ok: false, status, reasonCode }`; it never throws and never
 * touches a provider. `status` is UNSUPPORTED for a well-formed request outside the matrix, INVALID_REQUEST otherwise.
 */
export function validateRetrievalRequest({ category, brand, model, notes = '' } = {}) {
  if ([category, brand, model, notes].some((item) => typeof item !== 'string')) return reject('INVALID_REQUEST', 'INPUT_NOT_STRING');
  const fields = { category: clean(category), brand: clean(brand), model: clean(model), notes: clean(notes) };
  if (!fields.category || !fields.brand || !fields.model) return reject('INVALID_REQUEST', 'MISSING_FIELD');
  if (fields.category.length > MAX_FIELD_LENGTH || fields.brand.length > MAX_FIELD_LENGTH || fields.model.length > MAX_FIELD_LENGTH) return reject('INVALID_REQUEST', 'FIELD_TOO_LONG');
  if (fields.notes.length > MAX_NOTES_LENGTH) return reject('INVALID_REQUEST', 'NOTES_TOO_LONG');

  const canonicalCategory = CATEGORY_ALIASES[fields.category.toLowerCase()];
  if (!canonicalCategory) return reject('UNSUPPORTED', 'UNSUPPORTED_CATEGORY');
  const brands = SUPPORT[canonicalCategory];
  const canonicalBrand = Object.keys(brands).find((name) => name.toLowerCase() === fields.brand.toLowerCase());
  if (!canonicalBrand) return reject('UNSUPPORTED', 'UNSUPPORTED_BRAND');
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(fields.model)) return reject('INVALID_REQUEST', 'INVALID_MODEL_CHARACTERS');
  const entry = brands[canonicalBrand];
  const identity = entry.normalizeModel(fields.model);
  if (!identity) return reject('UNSUPPORTED', 'UNSUPPORTED_MODEL_PATTERN');
  return { ok: true, value: { category: canonicalCategory, brand: canonicalBrand, model: identity.baseModel, notes: fields.notes, entry } };
}

const modelKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function refusal(rejection, totalMs, providerCalls) {
  return { status: rejection.status, supported: false, input: null, query: null, report: null, retrievalQuality: null,
    reasonCodes: [rejection.reasonCode], notes: { mode: NOTES_MODES.FIT_ONLY, fitConstraintKeys: [], notScored: [] },
    deadline: { totalMs, elapsedMs: 0, reached: false }, providerCalls };
}

const clampDeadline = (value) => (Number.isFinite(value) && value > 0 ? Math.min(value, MAX_DEADLINE_MS) : DEFAULT_DEADLINE_MS);

/**
 * Server-callable replacement facade for a user-entered, supported model.
 *
 * Product identity is read from the validated brand/model/category alone; notes are read FIT_ONLY (installation and fit
 * constraints only) and everything else in them is returned as NOTE_NOT_SCORED. One deadline governs the whole run:
 * when it is reached, retrieval stops and whatever evidence was gathered is still evaluated (status PARTIAL).
 * Deterministic only: no model/AI path, no pricing, and provider/search rank never enters the evaluation.
 *
 * @param {{category: string, brand: string, model: string, notes?: string, deadlineMs?: number,
 *   deps?: {search?: Function, fetchPage?: Function, now?: () => number}}} request
 */
export async function recommendByRetrieval({ category, brand, model, notes = '', deps = {}, deadlineMs = DEFAULT_DEADLINE_MS } = {}) {
  const totalMs = clampDeadline(deadlineMs);
  const providerCalls = { search: 0, fetch: 0 };
  const validation = validateRetrievalRequest({ category, brand, model, notes });
  if (!validation.ok) return refusal(validation, totalMs, providerCalls);

  const { value } = validation;
  const query = `${value.brand} ${value.model} ${value.entry.noun}`;
  let interpretation;
  try {
    interpretation = interpretReplacementSearch({ query, notes: value.notes, notesMode: NOTES_MODES.FIT_ONLY });
  } catch {
    return refusal(reject('UNSUPPORTED', 'MODEL_NOT_RECOGNIZED'), totalMs, providerCalls);
  }
  const facts = interpretation.normalizedOriginal.facts;
  const recognized = interpretation.normalizedOriginal.category === value.category
    && String(facts.brand?.value || '').toLowerCase() === value.brand.toLowerCase()
    && facts.model?.status === 'KNOWN' && modelKey(facts.model.value) === value.model;
  if (!recognized) return refusal(reject('UNSUPPORTED', 'MODEL_NOT_RECOGNIZED'), totalMs, providerCalls);

  const baseSearch = deps.search || searchProducts;
  const baseFetch = deps.fetchPage || fetchSource;
  const search = (...args) => { providerCalls.search += 1; return baseSearch(...args); };
  const fetchPage = (...args) => { providerCalls.fetch += 1; return baseFetch(...args); };
  const deadline = createDeadline({ totalMs, now: deps.now });

  let report;
  try {
    report = await value.entry.run({ model: value.model, brand: value.brand, query, notes: value.notes, interpretation, deadline, search, fetchPage });
  } catch {
    return { status: 'NO_RESULT', supported: true, input: { category: value.category, brand: value.brand, model: value.model, notes: value.notes }, query,
      report: null, retrievalQuality: 'RETRIEVAL_FAILED', reasonCodes: ['ENGINE_ERROR'], notes: interpretation.notesReport,
      deadline: { totalMs, elapsedMs: deadline.elapsedMs(), reached: false }, providerCalls };
  }

  const reached = report.deadlineReached === true;
  const hasPrimary = Boolean(report.recommendation?.primary);
  const status = !hasPrimary ? 'NO_RESULT' : !reached && report.retrievalQuality === 'RETRIEVED_STRONG' ? 'COMPLETE' : 'PARTIAL';
  const reasonCodes = [...new Set([...report.reasonCodes, ...(interpretation.notesReport.notScored.length ? ['NOTE_NOT_SCORED'] : [])])];
  return {
    status,
    supported: true,
    input: { category: value.category, brand: value.brand, model: value.model, notes: value.notes },
    query,
    report,
    retrievalQuality: report.retrievalQuality,
    reasonCodes,
    notes: interpretation.notesReport,
    deadline: { totalMs, elapsedMs: deadline.elapsedMs(), reached },
    providerCalls,
  };
}
