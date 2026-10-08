import { getFact, present } from '../replacement-core/normalize-values.js';

function term(identity, key) {
  const entry = getFact(identity, key);
  return present(entry) ? String(entry.value) : '';
}

/** Query plans only. This function performs no search. */
export function buildSearchStrategy(original) {
  const brand = term(original, 'brand');
  const model = term(original, 'model');
  const tier = term(original, 'tier').replace('_', ' ').toLowerCase();
  const queries = [];
  if (model) queries.push(`${brand} ${model} current successor replacement`);
  if (original.category === 'television') {
    const size = term(original, 'screenSizeIn');
    const display = term(original, 'displayTechnology');
    const resolution = term(original, 'resolution');
    queries.push(`${brand} ${size} ${display} ${resolution} current TV model`);
    queries.push(`${brand} ${size} ${display} ${tier} current television`);
    queries.push(`${size} ${display} comparable current television`);
  } else if (original.category === 'refrigerator') {
    const configuration = term(original, 'configurationFloor');
    const capacity = term(original, 'totalCapacityCuFt');
    queries.push(`${brand} ${capacity ? `${capacity} cu ft` : ''} ${configuration} refrigerator current model`);
    queries.push(`${brand} ${configuration} ${tier} refrigerator current model`);
    queries.push(`${configuration} refrigerator comparable to ${brand} current model`);
  }
  return {
    strategyVersion: '1.0.0',
    queries: [...new Set(queries.map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3)
      .map((query, index) => ({ priority: index + 1, query })),
  };
}
