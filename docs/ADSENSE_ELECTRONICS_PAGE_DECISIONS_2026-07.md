# Electronics page quality decisions — July 2026

Base SHA: `dcf0ae790729dcf053d00bdefedb0e0370cf02e6`

This ledger records the evidence and disposition chosen for the eight pages in
the AdSense P1 electronics-quality batch. Scores use 0 (absent) through 5
(strong). They describe the pre-remediation page and repository evidence, not
search performance.

## Scorecard

| Route | Decoder | Unique facts | Examples | Intent | Independent | Useful without tool | Limits | Approval value | Total | Disposition |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/apple` | 3 | 4 | 2 | 5 | 1 | 3 | 2 | 3 | 23/40 | Retain, narrow |
| `/hp` | 4 | 3 | 3 | 4 | 1 | 3 | 2 | 3 | 23/40 | Retain, strengthen |
| `/sony` | 3 | 4 | 3 | 4 | 1 | 4 | 2 | 3 | 24/40 | Retain, narrow |
| `/bosch` | 5 | 5 | 5 | 5 | 1 | 4 | 2 | 4 | 31/40 | Retain, strengthen as appliances |
| `/google-pixel` | 3 | 2 | 1 | 4 | 1 | 2 | 1 | 1 | 15/40 | Temporarily noindex |
| `/panasonic` | 2 | 2 | 1 | 3 | 1 | 2 | 1 | 1 | 13/40 | Temporarily noindex |
| `/vizio` | 4 | 5 | 5 | 4 | 1 | 5 | 3 | 4 | 31/40 | Retain, narrow |
| `/samsung-tv-serial-number-decoder` | 5 | 5 | 5 | 5 | 1 | 5 | 3 | 5 | 34/40 | Retain, strengthen |

## Evidence and score explanations

### Apple

- Decoder 3: deterministic support exists for a legacy 12-character path, but
  10-character modern serials are explicitly treated as randomized.
- Unique facts 4: the legacy/randomized split and model-identifier recovery are
  materially different from sibling electronics pages.
- Examples 2: decoder-data supplied an example, but no dedicated regression
  fixture existed before this batch and the old page did not explain ambiguity.
- Intent 5: users commonly need to distinguish Apple serial, part, and model
  identifiers.
- Independent 1: the old page was a near-verbatim template copy.
- Useful without tool 3: official identifier-location guidance is useful even
  when modern serials cannot be decoded.
- Limits 2: randomized formats were present in code but not honestly centered in
  the old landing-page promise.
- Approval value 3: defensible only after narrowing away from a universal date
  decoder.
- Evidence: `decoder-data.js`; Apple’s [model-number guidance](https://support.apple.com/en-us/106343)
  and [serial-number guidance](https://support.apple.com/en-us/102858).

### HP

- Decoder 4: deterministic character-4 year-cycle and characters-5/6 week logic
  exists, with invalid-week handling.
- Unique facts 3: product number versus serial number and a week-based result are
  distinct, although product-family coverage is broad.
- Examples 3: a repository example exists but lacked a dedicated regression and
  previously overstated one decade.
- Intent 4: serial, product number, and model identification serve separate real
  support tasks.
- Independent 1: the old visible page was template-equivalent to its siblings.
- Useful without tool 3: label, HP System Information, and product-number guidance
  remain useful without decoding.
- Limits 2: the old page did not foreground decade ambiguity or product-family
  boundaries.
- Approval value 3: worthwhile once the repeating cycle and product-ID roles are
  explicit.
- Evidence: `decoder-data.js`; HP’s [identifier-location guide](https://support.hp.com/gb-en/document/ish_2039298-1862169-16).

### Sony

- Decoder 3: deterministic support is model-suffix based, not serial based, and
  covers only the configured recent suffix set.
- Unique facts 4: BRAVIA model-year suffix research is a distinct purpose.
- Examples 3: `XR65A90K` is stored in decoder data, but no dedicated regression
  existed before this batch.
- Intent 4: users need both model-year context and help finding a wall-mounted TV
  label.
- Independent 1: the old page claimed a serial decoder inside the shared copy.
- Useful without tool 4: model/serial distinction and system-menu recovery stand
  alone.
- Limits 2: the old page blurred model year and manufacture date.
- Approval value 3: useful after narrowing to Sony TV model identification.
- Evidence: `decoder-data.js`; Sony’s [TV model and serial guidance](https://www.sony.com/electronics/support/articles/00121074).

### Bosch

- Decoder 5: Bosch appliance FD logic is deterministic, validates month, and has
  existing regression coverage.
- Unique facts 5: E-Nr, FD, Z-Nr, and appliance-specific plate locations create a
  distinct purpose.
- Examples 5: `FD8605123456` is verified by an existing decoder regression.
- Intent 5: appliance production-number and model-number research is a clear,
  separate user need.
- Independent 1: the old page was incorrectly left in the electronics template.
- Useful without tool 4: field identification and rating-plate guidance remain
  useful without the decoder.
- Limits 2: the old page did not clearly restrict the rule to Bosch appliances.
- Approval value 4: strong after moving its purpose to the appliance FD path.
- Evidence: `decoder-data.js`, `tests/decoder-regressions.test.mjs`; Bosch’s
  [rating-plate finder](https://www.bosch-home.com/us/owner-support/how-to-find-your-model-number)
  and [manual lookup](https://www.bosch-home.com/us/owner-support/owner-manuals/).

### Google Pixel

- Decoder 3: a deterministic opening-digit/week function exists, but its family
  and era boundaries are not established by repository tests or official docs.
- Unique facts 2: phone IMEI, tablet serial, dock serial, and bundle serial differ,
  but the old page did not use that distinction.
- Examples 1: only an unverified example in decoder metadata existed.
- Intent 4: Pixel identifier recovery is a legitimate need.
- Independent 1: the old page was a template copy.
- Useful without tool 2: official identifier-location guidance has value, but the
  page needs more original support evidence.
- Limits 1: the old page promoted a manufacture-date decoder without sufficient
  qualification.
- Approval value 1: not strong enough for the approval-facing index today.
- Evidence: `decoder-data.js`; Google’s [device serial and IMEI guide](https://support.google.com/store/answer/3333000?hl=en).

### Panasonic

- Decoder 2: an opening-year-digit rule exists, but its second character is
  explicitly product-line dependent and no family fixtures exist.
- Unique facts 2: official label locations differ materially by product category.
- Examples 1: the only repository example is not independently verified.
- Intent 3: model/serial location is useful, but a universal Panasonic date intent
  is not supported.
- Independent 1: the old page was a template copy.
- Useful without tool 2: category-specific label guidance is useful but presently
  limited.
- Limits 1: the old page did not make the cross-family uncertainty prominent.
- Approval value 1: not strong enough for the approval-facing index today.
- Evidence: `decoder-data.js`; Panasonic’s [product-family label guide](https://help.na.panasonic.com/answers/how-to-find-the-model-number-or-serial-number-of-a-panasonic-product/).

### Vizio

- Decoder 4: Vizio is explicitly model-required; the decoder rejects arbitrary
  serials and supports model-year evidence.
- Unique facts 5: this is a model lookup by design, not a serial decoder.
- Examples 5: `VW32L HDTV10A` and serial-rejection behavior have existing
  regression coverage.
- Intent 4: model-year and TV-family identification are distinct user needs.
- Independent 1: the old page still used the generic serial-decoder template.
- Useful without tool 5: model-versus-serial guidance and label recovery are useful
  independently.
- Limits 3: decoder logic is honest, but the old page title and metadata were not.
- Approval value 4: strong after narrowing to model-year context.
- Evidence: `decoder-data.js`, `tests/decoder-regressions.test.mjs`; Vizio’s
  [registration and serial-location page](https://www.vizio.com/en/account/product-registration).

### Samsung TV

- Decoder 5: deterministic 15-character and shorter position rules exist.
- Unique facts 5: TV menu recovery, category separation, and a repeating year cycle
  distinguish it from Samsung appliances.
- Examples 5: `07R5CAHJB001234` is already documented in strengthened Samsung
  content and matches current decoder behavior.
- Intent 5: TV-specific serial and model research is independently useful.
- Independent 1: the old dedicated page was still a template copy.
- Useful without tool 5: label/menu guidance and cycle explanation stand alone.
- Limits 3: repeating years existed in code, but the old page did not give them
  enough prominence.
- Approval value 5: the strongest independent page in this eight-route set after
  strengthening.
- Evidence: `decoder-data.js`, `scripts/generate-seo-pages.js`, content regression
  tests; Samsung’s [About This TV guidance](https://www.samsung.com/us/support/answer/ANS10005222/).

## Final inventory decision

- Indexable and eligible for future editorial-page ad review: Apple, HP, Sony,
  Bosch, Vizio, Samsung TV.
- Public but `noindex, follow` and permanently denied ads in their current state:
  Google Pixel and Panasonic.
- Consolidated: none.
- Removed: none.
- Redirects added: none.

No page in this batch is approved to display ads now. “Eligible” means only that
the page may be considered in a later explicit ad-placement review after AdSense
approval; it does not activate or authorize advertising.
