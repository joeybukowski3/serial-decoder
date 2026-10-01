import { ROUTE_MODES } from './outcome.js';

export { ROUTE_MODES };

/**
 * Specificity router.
 *
 * Chooses between two Smart Lookup modes:
 *
 *   GENERAL_GUIDANCE   -- the query names only a brand and/or a product category
 *                         ("Samsung Refrigerator"). Nothing here can be dated, so
 *                         paid grounded research would be wasted; answer with
 *                         deterministic guidance (optionally enriched by a cheap
 *                         UNGROUNDED model) and ask for more detail.
 *   PRECISION_RESEARCH -- anything with identifying detail, or anything the router
 *                         is not sure about. This is the existing grounded flow.
 *
 * Deliberately NOT a database of model-number formats: it only asks whether the
 * query carries ANY signal beyond brand + category. When in doubt it returns
 * PRECISION_RESEARCH, and an unfamiliar-looking token can only ever push a query
 * toward precision research -- the router has no "invalid" outcome.
 */

// Tiers that, on their own, name no product. Everything else is precision.
const BROAD_TIERS = new Set(['brand-category', 'brand-only', 'category-only']);

/**
 * @param {object} queryInfo  Result of classifySmartLookupQuery (+ userNotes).
 * @returns {{mode: string, reasons: string[]}}  `reasons` explains PRECISION
 *   routing (empty for GENERAL_GUIDANCE) so tests and telemetry can show why.
 */
export function chooseSmartLookupRoute(queryInfo) {
  const info = queryInfo || {};
  const reasons = [];

  if (!BROAD_TIERS.has(info.querySpecificity)) reasons.push(`tier:${info.querySpecificity || 'unknown'}`);
  if (info.modelCompleteness && info.modelCompleteness !== 'none') reasons.push('model-like-token');
  if (info.exactModel || info.modelLineId || info.productFamily) reasons.push('recognized-product');
  if (info.serialIdentity || info.serviceTagIdentity || info.serviceTagIntent || info.hasLabeledIdentifier) {
    reasons.push('serial-or-tag');
  }
  if (Array.isArray(info.ambiguousIdentifiers) && info.ambiguousIdentifiers.length) reasons.push('extra-identifier');
  if (info.hasDigitToken) reasons.push('digit-token');
  if (info.distinctiveTokenCount > 0) reasons.push('distinctive-description');
  if (info.userNotes) reasons.push('user-notes');
  // Missing signal fields mean an older/foreign queryInfo: not enough to be sure.
  if (typeof info.distinctiveTokenCount !== 'number') reasons.push('signals-unavailable');

  return reasons.length
    ? { mode: ROUTE_MODES.PRECISION_RESEARCH, reasons }
    : { mode: ROUTE_MODES.GENERAL_GUIDANCE, reasons: [] };
}
