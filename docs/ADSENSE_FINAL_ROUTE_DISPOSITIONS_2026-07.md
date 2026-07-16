# Final AdSense route dispositions — July 2026

This record implements the bounded route decision requested by the final readiness audit. It does not authorize ads or an AdSense review request.

| Route | Evidence | Disposition | Destination / access policy |
| --- | --- | --- | --- |
| `/appliance-age-estimator` | A 134-word decision aid with no local tool. It usefully distinguishes serial decoding from model-based research, and `/how-old-is-my-appliance` links to it contextually. | Public `noindex, follow` | Self-canonical; excluded from sitemap; contextual discovery only; future ads denied. |
| `/replacement-lookup` | A 167-word input-preparation guide with no local tool. Its model/series/capacity checklist is useful before Smart Lookup, and the insurance/replacement guide provides a contextual entry point. | Public `noindex, follow` | Self-canonical; excluded from sitemap; contextual discovery only; future ads denied. |
| `/hvac-replacement-guide` | A 153-word HVAC-specific input and compatibility caution guide with no local tool. The final-install limitation is useful even though Smart Lookup performs the task. | Public `noindex, follow` | Self-canonical; excluded from sitemap; linked only from `/how-old-is-my-hvac`; future ads denied. |
| `/tv-replacement-guide` | A 148-word TV-input refinement guide with no local tool. Screen size, panel type, and exact model guidance remains useful before Smart Lookup. | Public `noindex, follow` | Self-canonical; excluded from sitemap; linked only from `/how-old-is-my-electronics`; future ads denied. |
| `/goodman-model-number-lookup` | Model-versus-serial boundaries, rating-plate locations, supported Goodman families, and model-based recovery already exist on the stronger Goodman page. The old route adds no independent tool. | Consolidate and permanently redirect | Direct 308-style Vercel permanent redirect to `/goodman-serial-number-lookup`; source file and schema removed. |
| `/whirlpool-model-number-lookup` | The stronger Whirlpool page already explains model use, repeating-year ambiguity, product families, label locations, and Smart Lookup recovery. | Consolidate and permanently redirect | Direct Vercel permanent redirect to `/whirlpool-serial-number-lookup`; source file and schema removed. |
| `/whirlpool-refrigerator-serial-number-lookup` | Whirlpool serial logic and refrigerator label guidance already exist on the Whirlpool parent and refrigerator product guide. | Consolidate and permanently redirect | Direct Vercel permanent redirect to `/whirlpool-serial-number-lookup`; contextual product-guide link retained on the destination. |
| `/whirlpool-dishwasher-serial-number-lookup` | Whirlpool serial logic and dishwasher label guidance already exist on the Whirlpool parent and dishwasher product guide. | Consolidate and permanently redirect | Direct Vercel permanent redirect to `/whirlpool-serial-number-lookup`; contextual product-guide link retained on the destination. |

## Metadata-head disposition

The final audit identified eleven Item Assist-first heads. Four consolidated source heads are removed. The four retained noindex workflow heads and the Contact, Feedback, and Security heads use Decode My Item for product/site metadata. Item Assist remains only as provider context where that relationship is explicitly explained.
