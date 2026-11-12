import { findResearchClaim } from '../contract.js';
import { classifyHost } from '../evidence.js';

/**
 * Model codes that recognised sellers' listing titles state for the generation a candidate is presented as, kept apart from price evidence.
 *
 * A listing can name a model without being able to set a price: a protection-plan or accessory bundle sells something else, so its price is never used, but its
 * title still shows that a seller states that model code. That is an OBSERVATION: it is not a verified identity, it does not verify any specification, and it is
 * never read for price. Observations are made only from rows of the presented generation, in the size asked about, from recognised sellers.
 *
 * Variants of one code (retailers truncate them) are one model. When the listings state codes that are not variants of each other, the conflict is kept and
 * no code is chosen: the candidate is then named without a code and nothing is priced as one exact model.
 */

export const OBSERVATION_STATUS = Object.freeze({ PRICED_LISTING: 'PRICED_LISTING', EXCLUDED_FROM_PRICE: 'EXCLUDED_FROM_PRICE' });
export const EXCLUSIONS = Object.freeze(['PROTECTION_PLAN', 'BUNDLE', 'NOT_USED_IN_PRICE', 'CONFLICTING_CODES']);
export const RETRIEVAL_BASES = Object.freeze(['RETRIEVED', 'UNKNOWN']);
export const MAX_OBSERVED_MODELS = 3;
export const MAX_RETAILERS = 3;
export const MAX_EXCERPT = 100;

/** Short spellings of one code are one model (the same rule that names a priced model). */
export const sameCode = (a, b) => { const [short, long] = a.length <= b.length ? [a, b] : [b, a]; return short === long || (short.length >= 6 && long.startsWith(short) && long.length - short.length <= 6); };

/** A bounded excerpt of a listing title, or null when it would relay a claim (a price, a link, an assurance). */
export function clipExcerpt(title) {
  const text = String(title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT);
  return text && !findResearchClaim(text) ? text : null;
}

/** The distinct model codes of the observed rows (variants merged, the fullest spelling kept), each with its rows. */
export function groupObserved(rows) {
  const groups = [];
  for (const row of rows.filter((entry) => entry.sku)) {
    const group = groups.find((entry) => sameCode(entry.model, row.sku));
    if (group) { group.rows.push(row); if (row.sku.length > group.model.length) group.model = row.sku; } else groups.push({ model: row.sku, rows: [row] });
  }
  // Variants are not transitive (a code can be a variant of two others that are not variants of each other), so groups that have become variants of one another merge.
  for (let index = 0; index < groups.length; index += 1) {
    for (let other = groups.length - 1; other > index; other -= 1) {
      if (!sameCode(groups[index].model, groups[other].model)) continue;
      const [absorbed] = groups.splice(other, 1);
      groups[index].rows.push(...absorbed.rows);
      if (absorbed.model.length > groups[index].model.length) groups[index].model = absorbed.model;
      index = -1;
      break;
    }
  }
  return groups;
}

const dayOf = (retrievedAt) => (typeof retrievedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(retrievedAt) && Number.isFinite(Date.parse(retrievedAt)) ? retrievedAt.slice(0, 10) : null);

function exclusionOf(rows, conflict) {
  // Listings of a model that are priced only as part of the family (the listings state more than one code) are not priced as that exact model.
  if (rows.some((row) => !row.reason)) return conflict ? 'CONFLICTING_CODES' : 'NOT_USED_IN_PRICE';
  return rows.every((row) => row.reason === 'SERVICE_PACKAGE') ? 'PROTECTION_PLAN' : 'BUNDLE';
}

/**
 * @param {{sku: string|null, host: string, title: string, reason: 'BUNDLE'|'SERVICE_PACKAGE'|null}[]} rows  rows of the presented generation, in the size asked about
 * @param {{pricedSku: string|null, pricedCount: number, retrievedAt?: string|null}} context  the code the candidate's priced listings state, if any, and when the rows were retrieved
 * @returns {{conflict: boolean, items: object[]}|null} null when no listing states a code
 */
export function buildObservations(rows, { pricedSku = null, pricedCount = 0, retrievedAt = null }) {
  const groups = groupObserved(rows);
  if (!groups.length) return null;
  const retrieved = dayOf(retrievedAt);
  const conflict = groups.length >= 2;
  const items = groups.map((group) => {
    const priced = Boolean(pricedSku) && pricedCount > 0 && sameCode(group.model, pricedSku) && group.rows.some((row) => !row.reason);
    const retailers = [...new Set(group.rows.map((row) => classifyHost(row.host)?.sourceName).filter(Boolean))].sort().slice(0, MAX_RETAILERS);
    const shown = group.rows.find((row) => !row.reason) || group.rows[0];
    return {
      model: group.model, status: priced ? OBSERVATION_STATUS.PRICED_LISTING : OBSERVATION_STATUS.EXCLUDED_FROM_PRICE, listings: Math.min(group.rows.length, 99), retailers,
      excerpt: clipExcerpt(shown.title), exclusion: priced ? null : exclusionOf(group.rows, conflict), retrievedAt: retrieved, retrievedBasis: retrieved ? 'RETRIEVED' : 'UNKNOWN',
    };
  }).sort((a, b) => (a.status === b.status ? 0 : a.status === OBSERVATION_STATUS.PRICED_LISTING ? -1 : 1) || b.listings - a.listings || a.model.localeCompare(b.model)).slice(0, MAX_OBSERVED_MODELS);
  return { conflict, items };
}
