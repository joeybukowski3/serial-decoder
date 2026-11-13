import { EXCLUSIONS, groupObserved } from './observations.js';

/**
 * Internal, bounded counters that say why a candidate's `modelObservations` block is, or is not, emitted. They are written to the engine's structured log only:
 * never into the public research response, and never any provider payload, listing title, seller, link, model code or query text. Every field is a small
 * integer, a boolean, or one of a fixed set of labels, so a log line stays a few hundred bytes however many listings were read.
 *
 * Reading them in order shows where a block can be lost:
 *   rowsConsidered          Shopping rows screened for the candidate
 *   sellersRecognised       ... of a recognised retailer or manufacturer (a row from any other seller can never be evidence)
 *   rowsOfSeries            ... whose title reads as the candidate's series (any generation, any size)
 *   rowsObservable          ... in the size asked about, recognised seller, and reading as a television: kept rows plus bundle / protection-plan rows
 *   rowsOfPresentedGeneration  ... of the generation the candidate is presented as (the rows observations are made from)
 *   rowsWithCodeToken       rows whose title contains something shaped like a model code, whatever its seller or generation
 *   identifiersRecognised   distinct model codes the maker's grammar read from the observable rows (any generation, variants merged)
 *   accessoryRowsSkipped    bundle / protection-plan rows left out because they read as an accessory or part, not a television
 *   observationsRetained    model codes kept as observations (at most 3)
 *   observationsExcluded    ... of those, how many are excluded from price, by reason
 *   conflict                the presented generation's listings state codes that are not variants of one another
 * The log line adds `emitted`: whether the final response carried the block (retained > 0 and emitted false means the contract dropped it).
 */

const MAX_COUNT = 99;
const cap = (value) => Math.max(0, Math.min(MAX_COUNT, Math.trunc(Number(value) || 0)));

/** @returns {object|null} counters for one candidate (see the field list above); null if they could not be computed, which never affects the answer. */
export function observationDiagnostics(input) {
  try { return countersOf(input || {}); } catch { return null; }
}

function countersOf({ tally, seen, observedRows, observations, conflict }) {
  const excluded = Object.fromEntries(EXCLUSIONS.map((reason) => [reason, 0]));
  for (const item of observations?.items || []) if (item.exclusion && Object.hasOwn(excluded, item.exclusion)) excluded[item.exclusion] += 1;
  return {
    rowsConsidered: cap(tally.considered), sellersRecognised: cap(tally.sellers), rowsOfSeries: cap(tally.series), rowsObservable: cap(seen.length),
    rowsOfPresentedGeneration: cap(observedRows.length), rowsWithCodeToken: cap(tally.codeTokens), identifiersRecognised: cap(groupObserved(seen).length),
    accessoryRowsSkipped: cap(tally.accessories), observationsRetained: cap(observations?.items?.length || 0), observationsExcluded: excluded, conflict: Boolean(conflict),
  };
}

/** A fresh tally for `screenListings` to count into. */
export const newTally = () => ({ considered: 0, sellers: 0, series: 0, codeTokens: 0, accessories: 0 });

/**
 * The enrichment record for the log, with `emitted` added to each candidate's counters from the response that was actually built. Candidates are matched by position
 * (`SUCCESSOR` is the response's successor; `ALT_n` is its n-th suggestion), which is how the engine keys them.
 */
export function withEmittedFlags(enrichment, response) {
  const counters = enrichment?.observations;
  if (!counters || typeof counters !== 'object') return enrichment;
  const candidateOf = (key) => (key === 'SUCCESSOR' ? response?.successor : /^ALT_(\d)$/.test(key) ? response?.suggestions?.[Number(key.slice(4)) - 1] : null);
  const observations = Object.fromEntries(Object.entries(counters).map(([key, entry]) => [key, { ...entry, emitted: Boolean(candidateOf(key)?.modelObservations) }]));
  return { ...enrichment, observations };
}
