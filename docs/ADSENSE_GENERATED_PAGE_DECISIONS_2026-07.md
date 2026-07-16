# Remaining generated-page quality decisions — July 2026

Base SHA: `d38c3935dfdc093a409f3d7dcd83ebbd01b9978d`

This ledger records the evidence and disposition for the 13 pages identified by
the historical AdSense low-value-content audit. Scores use 0 (absent) through 5
(strong) and describe the pre-remediation content plus current repository
support. They are not traffic or ranking scores.

## Scorecard

| Route | Decoder | Examples | Unique facts | Intent | Useful without tool | Limits | Independent | Approval value | Total | Disposition |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/refrigerator-serial-number` | 5 | 3 | 4 | 5 | 4 | 3 | 2 | 3 | 29/40 | Retain, narrow to label finding and supported-brand routing |
| `/washer-serial-number` | 5 | 2 | 4 | 5 | 4 | 3 | 2 | 3 | 28/40 | Retain, narrow to label finding and supported-brand routing |
| `/dryer-serial-number` | 5 | 2 | 4 | 5 | 4 | 3 | 2 | 3 | 28/40 | Retain, narrow to label finding and supported-brand routing |
| `/dishwasher-serial-number` | 5 | 3 | 5 | 5 | 5 | 3 | 2 | 4 | 32/40 | Retain, narrow to label finding and supported-brand routing |
| `/range-oven-serial-number` | 5 | 2 | 5 | 5 | 5 | 3 | 2 | 4 | 31/40 | Retain, narrow to label finding and supported-brand routing |
| `/whirlpool-serial-number-lookup` | 5 | 4 | 5 | 5 | 4 | 3 | 2 | 4 | 32/40 | Retain and strengthen |
| `/lg-serial-number-lookup` | 5 | 4 | 5 | 5 | 4 | 3 | 2 | 4 | 32/40 | Retain and strengthen |
| `/frigidaire-serial-number-lookup` | 5 | 5 | 5 | 5 | 4 | 3 | 2 | 4 | 33/40 | Retain and strengthen |
| `/maytag-serial-number-lookup` | 5 | 5 | 5 | 5 | 5 | 4 | 2 | 4 | 35/40 | Retain and strengthen |
| `/kenmore-serial-number-lookup` | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 5 | 37/40 | Retain and strengthen around OEM routing |
| `/trane-serial-number-lookup` | 4 | 3 | 4 | 5 | 4 | 3 | 2 | 3 | 28/40 | Retain and strengthen |
| `/rheem-serial-number-lookup` | 5 | 5 | 5 | 5 | 5 | 2 | 2 | 3 | 32/40 | Retain, narrow explicitly to Rheem HVAC |
| `/asus-serial-number-decoder` | 5 | 5 | 5 | 5 | 4 | 3 | 3 | 4 | 34/40 | Retain and strengthen |

## Evidence and score explanations

### Product-type routes

#### Refrigerator

- Decoder 5: the embedded appliance decoder includes supported Whirlpool, GE,
  LG, Samsung, Frigidaire, Bosch, and OEM-routed Kenmore paths.
- Examples 3: the old page mixed supported and merely illustrative cards, but
  regression fixtures exist for a Frigidaire refrigerator model and a
  Kenmore/LG refrigerator route.
- Unique facts 4: fresh-food liner, crisper, and interior-wall label locations
  differ from laundry and cooking products.
- Intent 5: users often know the product type before they can identify the
  brand-specific format.
- Useful without tool 4: label finding, OEM identification, and model-versus-
  serial guidance stand alone.
- Limits 3: repeating cycles and OEM dependence were present but diluted by a
  broad age-decoder promise.
- Independent 2: the old section order, five FAQs, and examples matched the
  shared product template.
- Approval value 3: defensible after narrowing away from a brand-independent
  universal decoder.
- Evidence: `decoder-data.js`, refrigerator/LG/Frigidaire/Kenmore regressions,
  Whirlpool's [label-location guide](https://producthelp.whirlpool.com/FAQ/Where_is_my_Model_and_Serial_Number_Located%3F),
  LG's [refrigerator identifier guide](https://www.lg.com/us/support/help-library/lg-refrigerator-how-to-find-my-model-and-serial-number--20153578508912),
  and Frigidaire's [all-appliance label guide](https://owner.frigidaire.com/support-articles/article/1858491-where-can-i-find-my-model-and-serial-number-).

#### Washer

- Decoder 5: multiple supported appliance-brand decoders apply after the user
  selects the washer's actual brand.
- Examples 2: one supported fixture existed, while two old cards were invented
  pattern placeholders rather than traceable results.
- Unique facts 4: top-load lid/tub locations and front-load door-frame locations
  create a separate recovery workflow.
- Intent 5: washer label and age lookup is a distinct product task.
- Useful without tool 4: configuration-specific label finding remains useful.
- Limits 3: the page mentioned decade cycles but did not clearly say that no
  product-type-only format exists.
- Independent 2: the old FAQ and conclusion structure was shared.
- Approval value 3: useful once positioned as brand routing rather than one
  washer-wide serial rule.
- Evidence: repository LG, Whirlpool, Maytag, Samsung, and Kenmore fixtures;
  Whirlpool, LG, Frigidaire, and Maytag official label-location guides.

#### Dryer

- Decoder 5: supported brand decoders apply to dryer serials after brand and
  era are established.
- Examples 2: the old page had one supported family fixture and two unresolved
  pattern cards, with no dryer-specific resolved model fixture.
- Unique facts 4: door-rim, cabinet-edge, gas-dryer access-panel, and stacked
  laundry label locations are product-specific.
- Intent 5: dryer age and label recovery is distinct from washer research.
- Useful without tool 4: label and fuel/configuration guidance stands alone.
- Limits 3: ambiguity was disclosed but brand routing was not the page's primary
  promise.
- Independent 2: the old editorial sections remained template-equivalent.
- Approval value 3: retain only with an honest product-guide purpose and no fake
  resolved example.
- Evidence: repository brand decoders; Whirlpool, LG, Frigidaire, and Maytag
  official dryer-label guidance.

#### Dishwasher

- Decoder 5: Bosch FD, Whirlpool-family, GE, Frigidaire, Samsung, and LG paths
  are supported.
- Examples 3: Bosch and Whirlpool-family fixtures exist; the old Frigidaire
  card was only illustrative.
- Unique facts 5: door-frame, tub-lip, hinge, panel-ready, and drawer-dishwasher
  locations are materially distinct.
- Intent 5: open-door label recovery and OEM identification form a separate
  user task.
- Useful without tool 5: the physical-location guide is independently useful.
- Limits 3: brand differences were listed, but the universal-decoder framing
  remained too broad.
- Independent 2: the old five-FAQ structure and conclusion were shared.
- Approval value 4: strong after replacing filler with traceable brand paths.
- Evidence: Bosch, Whirlpool, and Frigidaire regression fixtures; Whirlpool,
  LG, Frigidaire, and Maytag official dishwasher-label guidance.

#### Range and oven

- Decoder 5: Whirlpool, GE, Frigidaire, LG, Samsung, and Bosch-family appliance
  paths exist.
- Examples 2: the old page contained illustrative placeholders, but a verified
  Whirlpool range serial/model fixture exists.
- Unique facts 5: oven-frame, lower-drawer, wall-oven trim, cooktop underside,
  and commercial-style cavity labels create a distinct workflow.
- Intent 5: installed cooking products are unusually difficult to identify and
  need their own recovery instructions.
- Useful without tool 5: safe label-location and model-family guidance stand
  alone.
- Limits 3: repeated cycles were noted without centering the need to select the
  manufacturer first.
- Independent 2: the old visible structure was still shared.
- Approval value 4: strong after the verified Whirlpool range example replaces
  generic patterns.
- Evidence: the tested `RX3026733` / `WFE320M0JW0` Whirlpool range-family
  fixture and official Whirlpool, LG, Frigidaire, and Maytag cooking-product
  label guides.

### Brand routes

#### Whirlpool

- Decoder 5: separate validated nine- and ten-character paths return a year
  cycle plus production week and reject invalid weeks.
- Examples 4: multiple regression fixtures exist, including model-assisted
  narrowing of a range-family serial.
- Unique facts 5: character position changes with total serial length and the
  year code repeats on a 30-year cycle.
- Intent 5: Whirlpool spans refrigeration, laundry, dishwashing, and cooking.
- Useful without tool 4: length counting, label location, and model-era recovery
  are useful independently.
- Limits 3: the old page mentioned cycling but its metadata still promised an
  exact manufacture date.
- Independent 2: most old editorial blocks remained shared.
- Approval value 4: strong after exact-date claims and filler cards are removed.
- Evidence: `decodeWhirlpoolFamilyByLength`, Whirlpool regression fixtures, and
  Whirlpool's official label-location guide.

#### LG

- Decoder 5: the first digit plus two-digit month path is implemented and
  invalid/ambiguous outcomes are covered.
- Examples 4: washer and Kenmore-built refrigerator fixtures exercise the
  current LG decoder and model refinement.
- Unique facts 5: model numbers start with a letter while supported serials open
  with a numeric year/month group; decade remains ambiguous.
- Intent 5: LG spans kitchen, laundry, and electronics, requiring explicit
  product-family boundaries.
- Useful without tool 4: official category-specific label locations and model
  distinction stand alone.
- Limits 3: decade ambiguity was present but not prominent enough.
- Independent 2: old examples and FAQs followed the generic brand pattern.
- Approval value 4: defensible with verified month/year positions and honest
  decade limits.
- Evidence: LG decoder/refinement tests and LG's official [model and serial
  guide](https://www.lg.com/us/support/help-library/how-to-find-my-lg-model-and-serial-number-CT00000317-20152254906058).

#### Frigidaire

- Decoder 5: plant letters, repeating year digit, and production week logic are
  implemented with strict week validation.
- Examples 5: multiple serial-only and model-refined refrigerator fixtures
  exist, including `BA10515647` with `FFTR2045VS0`.
- Unique facts 5: factory prefix, year digit, production week, and optional
  model-era refinement form a distinct workflow.
- Intent 5: kitchen and laundry products share a recognizable family rule.
- Useful without tool 4: product-specific label guidance and ambiguity handling
  remain useful.
- Limits 3: the old page did not foreground the repeating-decade result.
- Independent 2: its old five FAQs and conclusion were shared.
- Approval value 4: strong with its verified model-assisted example.
- Evidence: Frigidaire decoder and model-refinement regressions plus Frigidaire's
  official label guide.

#### Maytag

- Decoder 5: distinct pre-2006 and post-2006 paths are implemented, including a
  dual-era result when the era is unknown.
- Examples 5: regression fixtures cover both-era, post-only, invalid, and
  explicit-era behavior.
- Unique facts 5: the Whirlpool acquisition boundary changes the supported
  serial interpretation.
- Intent 5: users need to avoid applying modern Whirlpool-family logic to older
  Maytag equipment.
- Useful without tool 5: era identification and label guidance are useful before
  decoding.
- Limits 4: era ambiguity exists in code and can be explained precisely.
- Independent 2: the old visible page did not make that unique logic dominant.
- Approval value 4: strong after the era decision becomes the page's center.
- Evidence: Maytag dual-era regression suite and Maytag's official [model and
  serial guide](https://www.maytag.com/content/maytagv2/en_us/services/contact-us/find-your-model---serial-number.html).

#### Kenmore

- Decoder 5: model-prefix routing maps Kenmore products to Whirlpool, LG, GE,
  Frigidaire, and Samsung-family decoders.
- Examples 5: regression fixtures verify 795-to-LG routing and a rare
  Samsung-built serial path.
- Unique facts 5: OEM identification must precede date interpretation.
- Intent 5: private-label ownership makes model-prefix research a distinct need.
- Useful without tool 5: the prefix map and manual-recovery workflow stand alone.
- Limits 4: the current fallback behavior is test-covered, though a missing
  prefix must remain clearly qualified.
- Independent 3: the old page already had a custom prefix section, but generic
  surrounding content diluted it.
- Approval value 5: the strongest independent purpose in this cluster.
- Evidence: Kenmore prefix/helper regression suite and Kenmore's official
  [manual lookup](https://www.kenmore.com/use-and-care-guide-search).

#### Trane

- Decoder 4: the supported modern numeric path validates the first two digits as
  a production-week-shaped value and reads digits 3-4 as year; malformed and
  implausible future values are rejected.
- Examples 3: a direct Trane regression exists, but the old page used an
  illustrative placeholder instead of the fixture.
- Unique facts 4: Trane's supported path is year-oriented and should not be
  presented as universal across every historical Trane serial era.
- Intent 5: rating-plate age research is a distinct HVAC workflow.
- Useful without tool 4: nameplate, component, warranty, and dealer recovery are
  useful without decoding.
- Limits 3: the old page did not clearly bound the supported numeric format.
- Independent 2: it was the cluster's closest template match with Rheem.
- Approval value 3: defensible after format boundaries replace universal claims.
- Evidence: Trane validation/future-year regressions and Trane's official
  [registration guidance](https://www.trane.com/residential/en/contact-us/).

#### Rheem

- Decoder 5: separate HVAC and water-heater implementations are extensively
  tested, including multiple water-heater styles and HVAC letter-plus-WWYY.
- Examples 5: verified fixtures exist for both categories.
- Unique facts 5: the same brand has materially different HVAC and water-heater
  identifier families.
- Intent 5: users need a clear category decision before decoding.
- Useful without tool 5: product-category and rating-label guidance stand alone.
- Limits 2: the old generic route preselected HVAC while prominent links called
  it both HVAC and water heaters, creating an important contradiction.
- Independent 2: its old page was the closest match to Trane.
- Approval value 3: retain only after explicitly narrowing this route to HVAC
  and sending water-heater users to the existing plumbing guide.
- Evidence: Rheem HVAC and water-heater regression suites, Rheem's official
  [water-heater serial guide](https://www.rheem.com/how-to-locate-and-read-your-rheem-water-heating-serial-numbers/),
  and its [resource center](https://www.rheem.com/products/resource-center/).

#### ASUS

- Decoder 5: validated serials use character 1 for year and character 2 for
  month; invalid length and characters are rejected.
- Examples 5: `E5N0CV123456` is a direct regression fixture resolving to May
  2014.
- Unique facts 5: laptops, desktops, motherboards, and monitors have distinct
  physical/system identifier recovery paths.
- Intent 5: ASUS serial and model identification is a clear electronics task.
- Useful without tool 4: BIOS, MyASUS, packaging, warranty-card, and device-label
  recovery remain useful.
- Limits 3: the old page used a fabricated-looking example and did not clearly
  bound the supported year-code table.
- Independent 3: some ASUS-specific copy existed, but it retained the same five
  FAQs and three filler cards.
- Approval value 4: strong after the tested fixture and supported-era boundary
  replace generic promises.
- Evidence: ASUS decoder regressions and ASUS's official [serial-number
  guide](https://www.asus.com/support/article/566/support/information/).

## Final inventory decision

- Retain and strengthen: Whirlpool, LG, Frigidaire, Maytag, Kenmore, Trane, ASUS.
- Retain but narrow: refrigerator, washer, dryer, dishwasher, range/oven product
  guides; Rheem as an HVAC-only route.
- Public noindex: none.
- Consolidated: none.
- Removed: none.
- Redirects added: none.

All 13 remain indexable because each has either a tested brand-specific decode
path or a distinct product-type label/routing purpose. Retention is conditional
on replacing generic examples and copied editorial blocks with the evidence
recorded above. No page is approved to display ads now.
