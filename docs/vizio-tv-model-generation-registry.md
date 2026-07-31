# VIZIO television model-generation registry

This document records the evidence behind `data/vizio-tv-generations.json`. The registry is deliberately a positive allow-list: a model resolves only when its complete normalized identity is an exact record or one of the canonical models enumerated by a constrained lineup pattern. A suffix letter or number never determines a year by itself.

## Research method

1. Prefer dated VIZIO lineup announcements that name the model or screen-size lineup.
2. Confirm complete retail model identities with VIZIO manuals, quick-start guides, product sheets, or current product pages.
3. Use the advertised model year as `modelYear`; use a one-year spillover range where retail production commonly crossed a calendar boundary.
4. Treat a model-generation date as product-line evidence only. It never populates an individual unit manufacture year.
5. Omit a model when the official material gives only a stem, screen size, or series name without enough information to establish the complete retail model identity.

No secondary source is required by the checked-in mappings. The 2013 M-Series replacement relationship was cross-checked against dated coverage during research, but the deterministic records rely on VIZIO sources.

## Exact-model evidence

| Canonical model | Series | Model year | Likely production | Evidence | Source date | Confidence | Type | Exceptions / notes |
|---|---|---:|---|---|---|---|---|---|
| M321i-A2 | M-Series | 2013 | 2013–2014 | [2013 M-Series announcement](https://www.vizio.com/en/press/2013/may/new-vizio-m-series-delivers-faster-smarter-all-led-hdtvs); [M321i-A2 manual](https://cdn.vizio.com/documents/downloads/hdtv/M321iA2/UM_M321iA2.pdf) | 2013-05-28 / 2013 | High identity; medium unit timing | exact-model | Announcement identifies the M321i stem; manual establishes the complete `-A2` model. |
| M322i-B1 | M-Series | 2014 | 2014–2015 | [2014 M-Series announcement](https://www.vizio.com/en/press/2014/jun/vizio-launches-beautifully-smart-2014-m-series-hdtv-collection) | 2014-06-10 | High / medium | exact-lineup | Complete model appears in official retail lineup. |
| M422i-B1 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M492i-B2 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | Uses `B2`, demonstrating that one lineup can contain several suffix numbers. |
| M502i-B1 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M552i-B2 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M602i-B3 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M652i-B2 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M702i-B3 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | — |
| M801i-A3 | M-Series | 2014 | 2014–2015 | Same 2014 lineup | 2014-06-10 | High / medium | exact-lineup | Important exception: the official 2014 lineup uses `A3`, not a B suffix. |
| RS65-B2 | Reference Series | 2015 | 2015–2016 | [Reference Series pricing and availability](https://www.vizio.com/en/press/2015/oct/vizio-announces-pricing-and-availability-for-highly-anticipated-reference-series-collection-featuring-dolby-vision-high-dynamic-range-support) | 2015-10-06 | High / medium | exact-model | `R65-B2` is retained as a documented label/transcription alias; canonical official identity is `RS65-B2`. |
| RS120-B3 | Reference Series | 2015 | 2015–2016 | Same Reference Series announcement | 2015-10-06 | High / medium | exact-model | — |
| PQ65-F1 | P-Series Quantum | 2018 | 2018–2019 | [2018 P-Series Quantum announcement](https://www.vizio.com/en/press/2018/apr/vizio-unveils-best-picture-ever-with-2018-p-series-quantum-4k-hdr-smart-tv) | 2018-04-10 | High / medium | exact-model | Single-model launch; therefore represented as exact evidence, not a family regex. |

## Constrained lineup patterns

Every pattern also stores its complete `canonicalModels` allow-list. The resolver requires the normalized input to identify exactly one member of that list; the regular expression is an integrity assertion and cannot widen coverage beyond the enumerated models.

| Pattern id | Canonical models | Series | Model year | Likely production | Official evidence | Source date | Confidence | Type / safety notes |
|---|---|---|---:|---|---|---|---|---|
| `vizio-2010-xvt-pro-lineup` | XVTPRO470SV, XVTPRO550SV, XVTPRO720SV | XVT Pro | 2010 | 2010–2011 | [VIZIO XVT Pro announcement](https://www.vizio.com/en/press/2010/jan/CES2010VizioUnveilsXVTProSeriesTVs) | 2010-01-04 | High / medium | constrained exact-lineup; only the three named models match. |
| `vizio-2013-m-series-lineup` | M401i-A3, M471i-A2, M501d-A2, M551d-A2, M601d-A3, M651d-A2, M701d-A3, M801d-A3 | M-Series | 2013 | 2013–2014 | [2013 lineup](https://www.vizio.com/en/press/2013/may/new-vizio-m-series-delivers-faster-smarter-all-led-hdtvs); official manuals for [M401i-A3](https://cdn.vizio.com/documents/downloads/hdtv/M401iA3/UM_M401iA3.pdf), [M321i-A2/M471i-A2](https://cdn.vizio.com/documents/downloads/hdtv/M471iA2/UM_M471iA2.pdf), [M501d/M551d/M651d](https://cdn.vizio.com/documents/downloads/hdtv/M551dA2/UM_M551dA2.pdf), and [M601d/M701d/M801d](https://cdn.vizio.com/documents/downloads/hdtv/M801dA3/UM_M801dA3.pdf) | 2013 | High / medium | constrained exact-lineup; the announcement establishes the stems and the manuals establish each complete suffix. `M321i-A2` remains a higher-priority exact record. |
| `vizio-2015-m-series-c-lineup` | M43-C1, M49-C1, M50-C1, M65-C1, M75-C1 | M-Series | 2015 | 2015–2016 | [2015 M-Series announcement](https://www.vizio.com/en/press/2015/apr/vizio-continues-push-to-bring-ultra-hd-technology-mainstream-with-release-of-all-new-2015-m-series-ultra-hd-smart-tv-collection); [official manual](https://cdn.vizio.com/documents/m43c1/um-m43c1.pdf) | 2015-04-13 / 2015 | High / medium | constrained exact-lineup. Sizes whose complete suffix was not confirmed by the cited manual are omitted. |
| `vizio-2015-d-series-lineup` | D24hn-D1, D24-D1, D28hn-D1, D28h-D1, D32hn-D0, D32hn-D1, D32-D1, D39hn-D0, D39h-D0, D40-D1, D40u-D1, D43-D1, D43-D2, D48-D0, D50-D1, D50u-D1, D55-D2, D55u-D1, D58u-D3, D60-D3, D65-D2, D65u-D2, D70-D3 | D-Series | 2015 | 2015–2016 | [official D-Series launch list](https://www.vizio.com/en/press/2015/dec/vizio-introduces-all-new-d-series-collection-featuring-excellent-picture-quality-along-with-smart-tv-and-4k-ultra-hd-in-select-models) | 2015-12-17 | High / medium | constrained exact-lineup; feature markers (`h`, `hn`, `u`) and suffix numbers are part of the identity. |
| `vizio-2016-p-series-c1-lineup` | P50-C1, P55-C1, P65-C1, P75-C1 | P-Series | 2016 | 2016–2017 | [official P-Series launch](https://www.vizio.com/en/press/2016/mar/vizio-debuts-next-generation-streaming-ecosystem-on-all-new-vizio-smartcast-p-series-ultra-hd-hdr-home-theater-display) | 2016-03-22 | High / medium | constrained exact-lineup. |
| `vizio-2018-m-series-f-lineup` | M55-F0, M65-F0, M70-F3 | M-Series | 2018 | 2018–2019 | [2018 M-Series announcement](https://www.vizio.com/en/press/2018/apr/vizio-launches-all-new-2018-m-series-4k-hdr-smart-tvs-featuring-step-up-picture-quality-and-bezel-less-design); [official manual](https://cdn.vizio.com/user-manual/PDF/2018/TV/M-Series_UM_ENG.pdf) | 2018-04-10 / 2018 | High / medium | constrained exact-lineup; explicitly preserves the F0/F3 split. |
| `vizio-2018-p-series-f1-lineup` | P55-F1, P65-F1, P75-F1 | P-Series | 2018 | 2018–2019 | [2018 P-Series announcement](https://www.vizio.com/en/press/2018/jun/vizio-announces-availability-of-all-new-2018-p-series-4k-hdr-smart-tvs-at-retailers-nationwide-such-as-best-buy-costco-walmart-sams-club-and-target); [official manual](https://cdn.vizio.com/user-manual/PDF/2018/TV/P-Series_UM_ENG.pdf) | 2018-06-05 / 2018 | High / medium | constrained exact-lineup. |
| `vizio-2019-v-series-g-lineup` | V405-G9, V435-G0, V505-G9, V506-G9, V555-G1, V555-G4, V556-G1, V605-G3, V655-G9, V656-G4, V756-G4 | V-Series | 2019 | 2019–2020 | [official quick-start guide](https://cdn.vizio.com/user-manual/PDF/2019/TV/QSG/D24h-G9_D32h-G9_V405-G9_V435-G0_V505-G9_V506-G9_V555-G1_V555-G4_V556-G1_V605-G3_V655-G9_V656-G4_V756-G4_QSG-EN-FR.pdf) | 2019 | High / medium | constrained exact-lineup; retailer/feature variants remain distinct. |
| `vizio-2019-m-series-quantum-lineup` | M437-G0, M507-G1, M558-G1, M658-G1 | M-Series Quantum | 2019 | 2019–2020 | [official M-Series Quantum manual](https://cdn.vizio.com/user-manual/PDF/2019/TV/UM/M437-G0_UM-ENG.pdf) | 2019 | High / medium | constrained exact-lineup. |
| `vizio-2021-oled-lineup` | OLED55-H1, OLED65-H1 | OLED | 2021 | 2020–2021 | [official OLED launch](https://www.vizio.com/en/press/2020/june-2020/vizio-debuts-unprecedented-home-theater-experience-with-masterfu) | 2020-06-30 | High / medium | constrained exact-lineup; VIZIO marketed these fall-2020 products as its 2021 OLED collection. |
| `vizio-2022-mq7-lineup` | M50Q7-J01, M55Q7-J01, M58Q7-J01, M65Q7-J01, M70Q7-J03, M75Q7-J03 | M-Series Quantum | 2022 | 2021–2022 | [2022 collection announcement](https://www.vizio.com/en/press/2021/jun/vizio-s-new-tv-lineup-unleashes-enhanced-picture-quality--improv); [official MQ7 manual](https://cdn.vizio.com/user-manual/PDF/2021/TV/2022_M7-Series-UM.pdf) | 2021-06-02 / 2021 | High / medium | constrained exact-lineup; J01 and J03 variants are enumerated. |
| `vizio-2022-v-series-lineup` | V435-J01, V505-J01, V505-J09, V506-J09, V555-J01, V585-J01 | V-Series | 2022 | 2021–2022 | [2022 collection announcement](https://www.vizio.com/en/press/2021/jun/vizio-s-new-tv-lineup-unleashes-enhanced-picture-quality--improv); [official V5 manual](https://cdn.vizio.com/user-manual/PDF/2021/TV/2022_V5-Series-UM.pdf) | 2021-06-02 / 2021 | High / medium | constrained exact-lineup; only manual-confirmed identities are included. |
| `vizio-2023-quantum-pro-lineup` | VQP65C-84, VQP75C-84 | Quantum Pro | 2023 | 2023 or later | [official Quantum Pro manual](https://www.vizio.com/content/dam/asset-portal/us/en/2023/tv/documentation/quantum-pro/2023_VIZIO_Quantum_Pro_UM.pdf); [current collection page](https://www.vizio.com/en/tv/quantum-pro) | 2023 / current catalog | High / medium | constrained exact-lineup. The open end reflects continued official catalog availability; it is not an individual unit date. |

## Known exceptions and deliberate gaps

- `M801i-A3` is the explicit proof that suffix-letter arithmetic is unsafe: it is in VIZIO's official 2014 M-Series beside B1/B2/B3 models.
- The 2013 M-Series suffixes are supported only for the complete models confirmed by the cited manuals. Nearby suffix variants remain unsupported.
- The 2015 M-Series announcement names more screen sizes than the cited manual. Models whose full suffix was not confirmed are deliberately unsupported.
- 2011–2012, 2017, 2020 non-OLED, and post-2023 models are not assigned broad deterministic years solely from their suffixes. They continue through shared Smart Lookup evidence.
- A VIZIO-looking typo or an unlisted suffix such as `M322i-Z9`, `M801i-B3`, or `V505-Z9` is not a local generation match.
- Production ranges are lineup-era estimates. A serial decode or dated manufacturing label is required to set `individualManufactureYear`.
