/**
 * Coherent timeout budgets for Serial Refinement.
 *
 * Preferred production path (deterministic_serper):
 *   local + model-production → Redis → Serper → Gemini extraction → evaluate
 *
 * Legacy Gemini rollback remains available but is bounded by the same
 * user-facing browser policy so timeouts still degrade to deterministic
 * serial/model context instead of a blank result.
 *
 * Justification (measured against current architecture):
 * - Serper orchestrator already caps aggregate search at 3s.
 * - Gemini non-grounded extraction historically needs ~3–5s; 4.5s leaves
 *   post-processing reserve inside a 12s API budget.
 * - Legacy grounded Gemini can take 4–12s alone; the outer API budget for
 *   legacy is therefore slightly higher (14s) but still under the 15s
 *   browser hard timeout so the client never hangs past the policy.
 */

export const REFINEMENT_BUDGETS = Object.freeze({
  browserTimeoutMs: 15000,
  /** Preferred production path total route budget. */
  deterministicApiTotalMs: 12000,
  /** Rollback path total route budget (still under browser). */
  legacyApiTotalMs: 14000,
  localOnlyApiTotalMs: 2000,
  localAndProductionDbMaxMs: 500,
  redisPhaseMaxMs: 500,
  redisReadMaxMs: 250,
  redisWriteMaxMs: 200,
  rateLimitMaxMs: 250,
  serperTotalMs: 3000,
  geminiExtractionMs: 4500,
  /** Reserved for deterministic evaluation + response assembly after providers. */
  deterministicCompletionReserveMs: 400,
  /** Minimum remaining budget before starting a heavy provider call. */
  providerStartReserveMs: 500,
  /** Provider stage max for deterministic_serper (nested under global deadline). */
  deterministicProviderMaxMs: 10000,
  /** Provider stage max for legacy_gemini (nested under global deadline). */
  legacyProviderMaxMs: 12500,
  /**
   * Primary native Gemini + Google Search research stage. Native research and
   * the legacy research fallback share ONE global deadline, so the two can
   * never run for the full length of both budgets back to back. The reserve
   * additionally guarantees the fallback a usable slice when native burns its
   * entire stage budget before failing.
   */
  nativeResearchMaxMs: 6500,
  nativeResearchFallbackReserveMs: 4000,
});

/**
 * Resolve mode-specific budgets.
 * @param {'legacy_gemini'|'deterministic_serper'|'local_only'} mode
 */
export function budgetsForRefinementMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'local_only') {
    return {
      ...REFINEMENT_BUDGETS,
      apiTotalMs: REFINEMENT_BUDGETS.localOnlyApiTotalMs,
      providerMaxMs: 0,
    };
  }
  if (m === 'deterministic_serper') {
    return {
      ...REFINEMENT_BUDGETS,
      apiTotalMs: REFINEMENT_BUDGETS.deterministicApiTotalMs,
      providerMaxMs: REFINEMENT_BUDGETS.deterministicProviderMaxMs,
    };
  }
  return {
    ...REFINEMENT_BUDGETS,
    apiTotalMs: REFINEMENT_BUDGETS.legacyApiTotalMs,
    providerMaxMs: REFINEMENT_BUDGETS.legacyProviderMaxMs,
  };
}
