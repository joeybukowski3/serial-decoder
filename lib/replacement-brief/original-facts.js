import { formatValue } from '../replacement-public/labels.js';
import { briefFactStatus } from './brief-text.js';

const MAX_FACTS = 20;
const MAX_FACT_SOURCES = 3;
const EXTRA_LABELS = Object.freeze({ widthIn: 'Width', heightIn: 'Height', depthIn: 'Depth', mountPattern: 'Mount pattern', modelYear: 'Model year', canonicalModel: 'Full model number' });
const EXTRA_KEYS = Object.freeze(['canonicalModel', 'modelYear', 'widthIn', 'heightIn', 'depthIn', 'mountPattern']);

const unique = (items) => [...new Set(items)];

/** Domains of the cited sources behind a fact. Only evidence the research actually returned is looked up. */
export function sourceDomains(refs, evidenceById) {
  return unique((refs || []).map((ref) => evidenceById.get(ref)?.domain).filter(Boolean)).slice(0, MAX_FACT_SOURCES);
}

function factValue(key, entry) {
  if (entry.status === 'AMBIGUOUS') return (entry.alternatives || []).map((item) => formatValue(key, item)).filter(Boolean).join(' or ') || null;
  return formatValue(key, entry.value);
}

/**
 * The original product's facts with a brief status (PROVIDED / REPORTED / INFERRED / ASSUMED / AMBIGUOUS / UNKNOWN). Required
 * rules always appear (as UNKNOWN when nothing is known); everything else appears only when something is known about it.
 */
export function buildOriginalFacts({ original, profile, researchIds, evidenceById }) {
  const required = (rule) => rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH');
  const wanted = [
    { key: 'model', label: 'Model', required: true },
    { key: 'brand', label: 'Brand', required: true },
    ...profile.rules.filter((rule) => ['HARD', 'STRONG'].includes(rule.bucket) && rule.key !== 'brand')
      .map((rule) => ({ key: rule.key, label: rule.label, required: required(rule) && rule.key !== 'physicalFit' })),
    ...EXTRA_KEYS.map((key) => ({ key, label: EXTRA_LABELS[key], required: false })),
  ];
  const seen = new Set();
  const facts = wanted.flatMap(({ key, label, required: isRequired }) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const entry = original.facts[key];
    if (!entry && !isRequired) return [];
    if (entry?.status === 'UNKNOWN' && !isRequired) return [];
    if (key === 'canonicalModel' && entry && factValue(key, entry) === factValue('model', original.facts.model || {})) return [];
    const status = briefFactStatus(entry, researchIds);
    return [{
      key, label, value: entry ? factValue(key, entry) : null, status,
      ...(status === 'AMBIGUOUS' ? { alternatives: (entry.alternatives || []).map((item) => formatValue(key, item)).filter(Boolean) } : {}),
      sources: sourceDomains(entry?.evidenceRefs, evidenceById),
    }];
  });
  return facts.slice(0, MAX_FACTS);
}
