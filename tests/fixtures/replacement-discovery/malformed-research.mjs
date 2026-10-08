import { currentQled55, tvCandidate } from './grounded-tv-research.mjs';

/** Entries that must each be rejected while the valid entry survives. */
export const missingModel = { ...tvCandidate({ model: 'QN55Q80D' }), model: undefined };
export const vagueModel = { ...tvCandidate({ model: 'QN55Q80D' }), model: 'Samsung 55 inch QLED' };
export const wrongCategory = { ...tvCandidate({ model: 'QN55Q90D' }), category: 'refrigerator' };
export const missingBrand = { ...tvCandidate({ model: 'QN55Q85D' }), brand: '' };
export const notAnObject = 'QN55Q80D is great';

export const partiallyValidCandidates = { candidates: [missingModel, vagueModel, wrongCategory, missingBrand, notAnObject, null, currentQled55] };

export const badPayloads = {
  notObject: 'nope',
  candidatesNotArray: { candidates: { model: 'QN55Q80D' } },
  emptyCandidates: { candidates: [] },
};

/** Claims a successor with no supporting source, only a similar name. */
export const unsupportedSuccessor = tvCandidate({ model: 'QN55Q80E', relationship: 'DIRECT_SUCCESSOR', relationshipSources: [], relatedModel: 'QN55Q80C' });
