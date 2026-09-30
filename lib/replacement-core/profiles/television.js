import { CONTRACT_VERSION, SCORING_VERSION } from '../enums.js';

const hard = (key, label, comparator, hardRule, refinement) => ({ key, label, bucket: 'HARD', comparator, hardRule, refinement });
const strong = (key, label, comparator, weightClass, refinement) => ({ key, label, bucket: 'STRONG', comparator, weightClass, refinement });
const secondary = (key, label, comparator) => ({ key, label, bucket: 'SECONDARY', comparator });

export const televisionProfile = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  profileId: 'television-lkq',
  profileVersion: '1.0.0',
  scoringVersion: SCORING_VERSION,
  category: 'television',
  rules: Object.freeze([
    hard('screenSizeIn', 'Screen size', 'numeric-minimum', 'MINIMUM', 'What is the original screen size?'),
    hard('resolution', 'Resolution', 'resolution-minimum', 'MINIMUM', 'What resolution does the original TV support?'),
    hard('tier', 'Product tier', 'tier-minimum', 'MINIMUM', 'What is the exact TV model or product line?'),
    hard('physicalFit', 'Documented physical fit', 'boolean-match', 'MATCH', 'What space or mounting size must the replacement fit?'),
    strong('displayTechnology', 'Display performance class', 'categorical', 'HIGH', 'What display technology or exact model does the original have?'),
    strong('refreshHz', 'Native refresh capability', 'numeric-similarity', 'HIGH', 'Does the original support native 120 Hz or have a gaming requirement?'),
    strong('smart', 'Smart TV functionality', 'boolean-similarity', 'HIGH', 'Did the original have built-in smart TV functionality?'),
    strong('hdr', 'HDR capability', 'categorical', 'NORMAL', 'Which HDR capabilities matter on the original TV?'),
    strong('brand', 'Same brand', 'categorical', 'NORMAL'),
    strong('series', 'Model family or series', 'categorical', 'NORMAL'),
    strong('featurePackage', 'Major feature package', 'categorical', 'NORMAL'),
    strong('gamingFeatures', 'Gaming or accessibility capabilities', 'categorical', 'NORMAL'),
    secondary('tuner', 'Tuner capability', 'categorical'),
    secondary('hdmiCount', 'HDMI port count', 'numeric-similarity'),
    secondary('hdmiGeneration', 'HDMI generation', 'categorical'),
    secondary('mountPattern', 'Exact mounting pattern', 'categorical'),
    secondary('speaker', 'Built-in speaker details', 'categorical'),
    secondary('smartPlatform', 'Exact smart platform', 'categorical'),
    secondary('connectivity', 'Minor connectivity', 'categorical'),
    secondary('finish', 'Finish or color', 'categorical'),
    secondary('modelYear', 'Model year', 'numeric-similarity'),
  ]),
  refinementOrder: Object.freeze(['model', 'tier', 'physicalFit', 'screenSizeIn', 'resolution', 'refreshHz', 'displayTechnology', 'modelYear']),
});
