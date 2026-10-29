import { REFRIGERATOR_CAPACITY_TOLERANCE_CU_FT, refrigeratorProfile } from '../replacement-core/profiles/refrigerator.js';
import { televisionProfile } from '../replacement-core/profiles/television.js';
import { IMPORTANCE } from '../replacement-public/labels.js';

/**
 * Category guidance: what to look for when replacing the item. Static, plain-language and tied to the rule profiles, so it is
 * available even when research fails and can never contain a specification of a particular product.
 */

const TIER = 'Stay in the same product tier or higher. Entry-level lines can drop features even at the same size.';

const GUIDANCE = Object.freeze({
  television: Object.freeze({
    screenSizeIn: 'Choose the same screen size class or larger. A smaller screen is a downgrade; a larger one may not fit your space or mount.',
    resolution: 'Match or exceed the original resolution (for example 4K). A lower resolution is a downgrade.',
    tier: TIER,
    physicalFit: "Compare the new TV's width, height and depth with your space. If you will reuse a wall mount, check its mounting pattern too.",
    displayTechnology: 'Panel type (for example QLED, OLED or LED) affects picture quality. Prefer the same class or a better one.',
    refreshHz: 'Native refresh rate matters for fast motion and gaming. Compare native rates, not marketing "motion rate" numbers.',
    smart: 'If the original was a smart TV, the replacement should include built-in apps and streaming.',
  }),
  refrigerator: Object.freeze({
    totalCapacityCuFt: `Match the original total capacity. This comparison allows up to ${REFRIGERATOR_CAPACITY_TOLERANCE_CU_FT} cu. ft. less, so equal or larger is safest.`,
    installationType: 'Freestanding, built-in and integrated units are not interchangeable. Keep the same installation type.',
    physicalFit: 'Measure the opening width, height and depth, plus clearances for doors and ventilation, and compare them with published dimensions.',
    tier: TIER,
    configurationFloor: 'Keep the same overall layout (for example side-by-side, French door or top freezer). Changing it changes how the space works.',
    layout: 'The exact door and drawer arrangement affects day-to-day use, so look for the same arrangement.',
    counterDepth: 'If the original is counter-depth, the replacement should be too, or it may stick out past the cabinets.',
    capacityBalance: 'Compare fresh-food and freezer capacity separately, not just the total.',
    dispenser: 'Keep the same dispenser type (through-door water or ice, or none) if you use it.',
    iceMaker: 'If the original had an installed ice maker, the replacement should have one too.',
  }),
});

const PROFILES = Object.freeze({ television: televisionProfile, refrigerator: refrigeratorProfile });

/** Fit advice for the checklist. */
export const FIT_CHECK = Object.freeze({
  television: "Compare each TV's published width and height with your space, and its wall-mount pattern if you will reuse a mount.",
  refrigerator: "Measure the opening (width, height, depth) and clearances, then compare them with each refrigerator's published dimensions.",
});

export const MODEL_LOCATION_TIP = Object.freeze({
  television: 'Find the exact model number on the label on the back of the TV or in its settings menu.',
  refrigerator: 'Find the exact model number on the label inside the fresh-food compartment or on the door frame.',
});

/**
 * "What matters" bullets: every HARD rule and every STRONG rule with HIGH weight that has guidance, in profile order.
 * `originalFacts` (brief fact entries) adds the original's own value and status when it is known.
 */
export function buildWhatMatters(category, originalFacts = []) {
  const byKey = new Map(originalFacts.map((fact) => [fact.key, fact]));
  return PROFILES[category].rules
    .filter((rule) => (rule.bucket === 'HARD' || (rule.bucket === 'STRONG' && rule.weightClass === 'HIGH')) && GUIDANCE[category][rule.key])
    .map((rule) => {
      const fact = byKey.get(rule.key);
      return {
        key: rule.key,
        label: rule.label,
        importance: IMPORTANCE[rule.bucket],
        guidance: GUIDANCE[category][rule.key],
        original: fact && fact.value ? { value: fact.value, status: fact.status } : null,
      };
    });
}
