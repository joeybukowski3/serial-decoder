function comparisonKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function ambiguityKey(value) {
  return comparisonKey(value).replace(/[IL1]/g, '1');
}

function normalizationSteps(enteredModel, canonicalModel, usedAmbiguity) {
  const steps = [];
  const entered = String(enteredModel || '').trim();
  const enteredCharacters = entered.replace(/[^A-Za-z0-9]/g, '');
  const canonicalCharacters = canonicalModel.replace(/[^A-Za-z0-9]/g, '');
  if (enteredCharacters !== canonicalCharacters
    && enteredCharacters.toUpperCase() === canonicalCharacters.toUpperCase()) steps.push('case');
  if (comparisonKey(entered) === comparisonKey(canonicalModel)
    && entered.toUpperCase() !== canonicalModel.toUpperCase()) steps.push('separator');
  if (usedAmbiguity) steps.push('character-ambiguity');
  return Array.from(new Set(steps));
}

export function normalizeVizioModelEntry(value, knownModels = []) {
  const enteredModel = String(value || '').trim();
  const enteredKey = comparisonKey(enteredModel);
  if (!enteredKey || enteredKey.length < 5) return null;

  const candidates = [];
  for (const item of knownModels) {
    const canonicalModel = String(item.canonicalModel || '').trim();
    if (!canonicalModel) continue;
    const canonicalKey = comparisonKey(canonicalModel);
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
    const exactCanonical = enteredKey === canonicalKey;
    const exactAlias = aliases.find((alias) => comparisonKey(alias) === enteredKey);
    const ambiguityMatch = !exactCanonical && !exactAlias
      && ambiguityKey(enteredModel) === ambiguityKey(canonicalModel);
    if (!exactCanonical && !exactAlias && !ambiguityMatch) continue;

    candidates.push({
      ...item,
      enteredModel,
      canonicalModel,
      matchedBy: exactCanonical ? 'canonical-model' : 'exact-alias',
      normalizationApplied: normalizationSteps(
        enteredModel,
        canonicalModel,
        ambiguityMatch || Boolean(exactAlias
          && comparisonKey(exactAlias) !== canonicalKey
          && ambiguityKey(exactAlias) === ambiguityKey(canonicalModel)),
      ),
    });
  }

  if (candidates.length !== 1) return null;
  return candidates[0];
}

export const _normalizationInternals = { comparisonKey, ambiguityKey };
