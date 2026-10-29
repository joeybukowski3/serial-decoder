import { attributedQuantities } from './claims.js';
import { codeSupported, namedCodes, sameModel } from './model-codes.js';
import { modelKey, sizeFacts } from './product-tokens.js';

/**
 * Code-owned assessment of a replacement candidate's capacity against the original's, replacing what the model asserted. The model's
 * comparison rows are guesses ("MEETS" for a 26 cu ft refrigerator against a 27.8 cu ft original). Capacity is an essential requirement, so the
 * guess decides whether a candidate can set the range, and it is held to what the search returned instead:
 *   - a capacity stated in a listing title for the candidate's OWN model code (or a finish variant of it), and attributable to that code, is
 *     compared with the original's checked capacity: a fit is MEETS, a figure below the tolerance is SHORTFALL;
 *   - anything else (a family with no model code, a code no listing shows, no stated capacity, no checked capacity for the original, figures
 *     that disagree) is UNKNOWN, and a model "MEETS" or "EXCEEDS" is lowered to UNKNOWN. A model's "SHORTFALL" with nothing behind it is left as
 *     the estimate it is: it only ever keeps a candidate out of the range, never lets one in.
 * Nothing is invented: no specification is taken from the model, and no capacity is assumed for a family.
 */

const KEY = 'capacity';
const shown = (value) => String(Math.round(value * 10) / 10);

/** The capacities (cu ft) stated, for the candidate's own model code, in the titles that name that code. */
function stated(name, rows) {
  const codes = namedCodes(name);
  if (!codes.length) return [];
  const own = (key) => codes.some((code) => sameModel(modelKey(code), key));
  const values = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = String(row?.title || '');
    if (!codes.some((code) => codeSupported(code, [title]))) continue;
    for (const quantity of attributedQuantities(title, own)) if (quantity.unit === 'cuft') values.push(quantity.value);
  }
  return values;
}

/**
 * @param {{name: string, comparison?: object[]}} candidate  as the model named it (the exact code is judged here, before any demotion)
 * @param {{kind: string, value: number, atLeast?: boolean}|null} spec  the original's capacity or size, when known
 * @param {{title: string}[]} rows  the Shopping rows retrieved for this candidate
 * @returns {{comparison: object[], concern: string|null}|null}  the candidate's comparison with its capacity row settled, and a concern when
 *   the evidence shows a shortfall; null when nothing changes
 */
export function assessCapacity(candidate, spec, rows) {
  const comparison = Array.isArray(candidate?.comparison) ? candidate.comparison : [];
  const asserted = comparison.find((row) => row.requirementKey === KEY);
  const values = spec && spec.kind === 'capacity' ? stated(candidate.name, rows) : [];
  const fits = (value) => sizeFacts(spec, 'refrigerator', `${value} cu ft`).agrees;
  let status = 'UNKNOWN';
  if (values.length) status = values.every(fits) ? 'MEETS' : values.every((value) => !fits(value) && value < spec.value) ? 'SHORTFALL' : 'UNKNOWN';

  if (status === 'UNKNOWN') {
    if (!asserted || !['MEETS', 'EXCEEDS'].includes(asserted.status)) return null;
    return { comparison: comparison.map((row) => (row === asserted ? { ...row, status: 'UNKNOWN', basis: 'AI_ESTIMATE' } : row)), concern: null };
  }
  const settled = { requirementKey: KEY, status, basis: 'AI_ESTIMATE' };
  const concern = status === 'SHORTFALL' ? `Listings show ${shown(Math.min(...values))} cu ft, below the original's ${shown(spec.value)} cu ft.` : null;
  return { comparison: asserted ? comparison.map((row) => (row === asserted ? settled : row)) : [...comparison, settled], concern };
}
