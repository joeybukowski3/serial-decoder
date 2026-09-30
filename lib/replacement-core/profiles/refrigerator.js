import { CONTRACT_VERSION, SCORING_VERSION } from '../enums.js';

const hard = (key, label, comparator, hardRule, refinement) => ({ key, label, bucket: 'HARD', comparator, hardRule, refinement });
const strong = (key, label, comparator, weightClass, refinement) => ({ key, label, bucket: 'STRONG', comparator, weightClass, refinement });
const secondary = (key, label, comparator) => ({ key, label, bucket: 'SECONDARY', comparator });

export const refrigeratorProfile = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  profileId: 'refrigerator-lkq',
  profileVersion: '1.0.0',
  scoringVersion: SCORING_VERSION,
  category: 'refrigerator',
  rules: Object.freeze([
    hard('totalCapacityCuFt', 'Total capacity', 'numeric-minimum', 'MINIMUM', 'What is the original total capacity?'),
    hard('installationType', 'Installation type', 'categorical-match', 'MATCH', 'Is the original built-in, integrated, column, or freestanding?'),
    hard('physicalFit', 'Documented physical fit', 'boolean-match', 'MATCH', 'What are the opening width and required clearances?'),
    hard('tier', 'Product tier', 'tier-minimum', 'MINIMUM', 'What is the exact refrigerator model or product line?'),
    hard('configurationFloor', 'Broad functional configuration', 'configuration-floor', 'MATCH', 'What is the original door and freezer arrangement?'),
    strong('layout', 'Exact configuration and layout', 'categorical', 'HIGH', 'What door and drawer layout does the original have?'),
    strong('counterDepth', 'Counter-depth presentation', 'boolean-similarity', 'HIGH', 'Is the original counter-depth?'),
    strong('capacityBalance', 'Refrigerator/freezer capacity balance', 'categorical', 'HIGH', 'What are the refrigerator and freezer capacities?'),
    strong('dispenser', 'Dispenser configuration', 'categorical', 'HIGH', 'Does the original have a water or ice dispenser?'),
    strong('iceMaker', 'Installed ice maker', 'boolean-similarity', 'HIGH', 'Does the original have an installed ice maker?'),
    strong('finish', 'Finish', 'categorical', 'NORMAL', 'What finish does the original have?'),
    strong('brand', 'Same brand', 'categorical', 'NORMAL'),
    strong('series', 'Series or model family', 'categorical', 'NORMAL'),
    strong('featurePackage', 'Major feature package', 'categorical', 'NORMAL'),
    secondary('handleStyle', 'Handle style', 'categorical'),
    secondary('shelfLayout', 'Exact shelf and bin layout', 'categorical'),
    secondary('wifi', 'Wi-Fi', 'boolean-similarity'),
    secondary('minorConvenience', 'Minor convenience features', 'categorical'),
    secondary('efficiency', 'Small efficiency differences', 'categorical'),
  ]),
  refinementOrder: Object.freeze(['totalCapacityCuFt', 'physicalFit', 'dispenser', 'finish', 'model', 'tier', 'configurationFloor', 'installationType']),
});
