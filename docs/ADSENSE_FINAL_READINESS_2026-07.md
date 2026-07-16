# Decode My Item — Final AdSense approval-readiness review

Audit date: 2026-07-16

Production: <https://www.decodemyitem.com>

Repository: `joeybukowski3/serial-decoder`

Branch: `audit/adsense-final-readiness`

Base SHA: `88b2c5c27c23a1dd8f15e22b7cc496c29bc979ad`

## Evidence legend and limits

- **[POLICY]** Official Google documentation. This report does not infer a private approval formula.
- **[REPO]** Latest committed `main`, generated output, tests, or GitHub/Vercel state.
- **[PROD]** Direct HTTP or headless-browser observation of the live site on 2026-07-16.
- **[INFERENCE]** A stated audit judgment based on the preceding evidence.

Google says an AdSense-ready site should provide valuable, sufficiently unique content, a good user experience, and navigation. Google Publisher Policies also prohibit Google-served ads on screens with low-value/no publisher content, screens under construction, and screens used mainly for navigation or behavioral purposes. Those public statements set the standard used here; they do not reveal how Google will decide this site's next review. [AdSense site-readiness guidance](https://support.google.com/adsense/answer/12176698?hl=en), [screens without publisher content](https://support.google.com/publisherpolicies/answer/11112688?hl=en), [replicated-content policy](https://support.google.com/publisherpolicies/answer/11190248?hl=en). **[POLICY]**

## Executive decision

# ONE FINAL FOCUSED BATCH REQUIRED

The original P0 and scaled-template blockers are genuinely resolved. Production matches latest `main`; obsolete public pages return a branded HTTP 404; unfinished cards are gone; Privacy and Security now disclose analytics, APIs, logs, cookies, and the AdSense readiness loader; the two remediated generated clusters are materially differentiated; routes, sitemap, canonicals, robots, and internal links are clean. **[REPO][PROD]**

The site is nevertheless not ready to resubmit today because one bounded approval-facing set remains:

1. Eight indexable/sitemapped landing pages contain only 134–260 static editorial words, have no functioning tool on the page, largely hand users to a stronger existing workflow, and receive only 1–3 static inbound links. They are 12.9% of the 62-URL indexable set. **[REPO]**
2. The homepage H1 still promises “Get the Manufacture Date Instantly,” while the product correctly documents unsupported formats and decade ambiguity elsewhere. Its first content sequence is the two tools followed by a brand directory and footer; Methodology, About, history guides, limitations, and the correction path are not presented as an inline publisher/editorial section. **[REPO][PROD]**
3. The Privacy Policy's four-column tables force document-level overflow at 320 and 375 px and become extremely narrow and difficult to read. The exact overflowing elements are `.policy-table` tables measuring 485–496 px. **[PROD]**
4. Eleven indexable page heads still use Item Assist-first title, Open Graph, Twitter, description, or schema branding. Three are trust pages (`/contact`, `/feedback`, `/security`); the other eight are the thin routes above. **[REPO][PROD]**
5. About states that a team of licensed insurance adjusters, independent appraisers, and appliance technicians created and uses the tool. This may be true, but this audit has no independent evidence for those credentials. The publisher must verify the claim or soften it before treating it as a trust signal. **[REPO][INFERENCE]**

These are material in the context of a confirmed “Low value content” rejection, but they form one small trust/indexability batch rather than a broad content program. Do not check AdSense's confirmation box or request review yet. After this batch is deployed, wait until Search Console shows that the changed homepage and sitemap set have actually been recrawled.

## 1. Deployment and repository alignment

| Check | Result | Evidence |
|---|---|---|
| Latest main | `88b2c5c27c23a1dd8f15e22b7cc496c29bc979ad` | `[REPO]` |
| PR #47 | Merged; unit and both browser jobs passed; Vercel passed | `[REPO]` |
| PR #48 | Merged; unit jobs and Smart Lookup browser passed; its Serial browser job failed only because Chromium was absent | `[REPO]` |
| PR #49 | Merged; both CI workflows and both browser jobs passed; it corrected both workflows to install Chromium and Edge | `[REPO]` |
| Production deployment | Vercel status on main SHA: `success`, “Deployment has completed” | `[REPO]` |
| Production vs committed bodies | Zero mismatches across directly served root HTML pages | `[PROD]` |
| Representative pages | All requested homepage/tool/trust/brand/product/noindex pages matched committed title, H1, canonical, robots, and body | `[PROD]` |
| SEO generation | 26 outputs regenerated twice with empty tracked diff | `[REPO]` |
| Normal build | Run twice with empty tracked diff | `[REPO]` |

Production is not stale. The audit findings below describe the code currently served to users.

## 2. Original blocker resolution

| Original blocker | Status | Exact evidence |
|---|---|---|
| Internal/demo pages live publicly | **Resolved** | `/diagnostic`, `/serial-guide-refactor`, and `/universal-decoder` return branded 404 with HTTP 404. `analytics-report.html` and `brand-page-template.html` remain excluded and return 404. `[PROD]` |
| Abandoned duplicate pages | **Resolved in production** | 18 compatibility sources return one direct 308 to current canonical routes; none is in the sitemap or linked internally. Old source files remain only behind redirects. `[REPO][PROD]` |
| Contradictory robots directives | **Resolved** | Every current public file has at most one robots policy; no sitemap page is noindex. `[REPO][PROD]` |
| Visible under-construction content | **Resolved** | Item History Guides contains only seven available guide cards; public-output search found no scoped “Coming Soon”/under-construction markers. `[REPO][PROD]` |
| Repetitive electronics templates | **Resolved** | Mean similarity 11.6%, maximum 14.5%, shared 5-gram ratio 17.6%; Google Pixel and Panasonic are noindex and absent from sitemap. `[REPO]` |
| Generic generated brand/product pages | **Resolved for audited 13** | Mean similarity 18.0%, maximum 24.0%, shared 5-gram ratio 25.6%; page-specific purposes, limits, examples, and FAQs enforced. `[REPO]` |
| Unresolved filler examples | **Resolved in remediated clusters** | Regression tests reject illustrative/unresolved example cards; dryer transparently has no fabricated example. `[REPO]` |
| Generic FAQ duplication | **Resolved in remediated clusters** | Generated pages use distinct visible FAQ sets. Across the current public/indexable set, 177 FAQ schema questions on 34 pages were all found in visible content. `[REPO]` |
| Unsupported exact-date claims | **Partially resolved** | Retained generated pages state ambiguity and supported boundaries, but the homepage H1 and `/how-old-is-my-appliance` hero still promise an instant/exact manufacture date. `[REPO][PROD]` |
| False Privacy/Security statements | **Resolved** | Both pages acknowledge GA4, browser/device/page/referral/IP-derived data, cookies/similar identifiers, API processing, hosting logs, and the inactive AdSense readiness loader. `[REPO][PROD]` |
| Weak publisher transparency | **Partially resolved** | About and Methodology explain Decode My Item/Item Assist, sources, limitations, and corrections. Eleven indexable heads retain competing Item Assist-first metadata, and About's credential claim requires owner verification. `[REPO][INFERENCE]` |
| Weak page distinctiveness | **Partially resolved** | Strong/generated clusters improved, but eight thin sitemap landing pages remain and three older guide pairs share 30–48% editorial 5-grams. The latter mostly reflects legitimate shared label-reading guidance and is monitor-only. `[REPO][INFERENCE]` |
| Page-purpose/category mismatch | **Resolved** | Bosch is appliance-focused; Rheem route is HVAC-specific; Sony/Vizio/Apple are narrowed; water-heater users go to the plumbing path. `[REPO][PROD]` |
| Sitemap/indexability mismatch | **Technically resolved; quality set partial** | All 62 sitemap URLs are 200, indexable, self-canonical, and non-orphaned. Eight weak routes still should not be in the approval-facing sitemap set. `[REPO][PROD][INFERENCE]` |
| Browser/CI validation gaps | **Resolved, with one new UX finding** | PR #49 CI is green with Chromium and Edge; local suites pass. Production review found Privacy mobile overflow not covered by current regression tests. `[REPO][PROD]` |
| Ad verification and ads.txt readiness | **Resolved** | Publisher ID remains `pub-5946778263750869`; ads.txt is valid; one loader at most per tagged source; CSP permits it; zero visible units or authored ad slots. `[REPO][PROD]` |

## 3. Current public-route inventory summary

- Root HTML source files: **89**
- Generator-controlled outputs: **26**
- Indexable and in sitemap: **62**
- Live public noindex canonical utilities/pages: **6**
- Intentional legacy redirect sources: **18**
- Excluded internal/demo files returning 404: **2**
- Branded 404 source: **1**
- Production route errors: **0 unexpected**
- Production source/body mismatches: **0**
- Broken internal links: **0**
- Redirecting internal links: **0**
- Orphaned indexable pages: **0**
- Sitemap/indexability/canonical conflicts: **0**
- Contradictory robots tags: **0**

Quality codes used in the appendix:

- **A** strong original editorial content
- **B** strong tool plus supporting content
- **C** narrow but useful utility/guide
- **D** public noindex/error utility
- **E** legal/trust/administrative page
- **F** thin or weakly differentiated indexable page
- **G** internal/demo/test source
- **H** intentional duplicate/legacy redirect source
- **I** misleading/unsupported page
- **J** manual review required

“Words” excludes scripts, styles, nav, footer, SVG, and forms. “Unique” is a qualitative page-specific-content estimate, not a Google metric. “Tool/static/no-JS/no-decoder” records whether the route contains a functioning tool, has at least 150 static editorial words, remains useful without JavaScript, and remains useful without an embedded decoder. FAQ parity was verified by matching all FAQ schema question names to visible text.
`index*` means no robots meta is present and the route is indexable by default. Redirect-source metadata is recorded for source inventory only and is not served before the redirect.

## 4. Sitewide content-quality ratios

Indexable denominator: 62 pages.

| Class | Count | % | Original audit comparison |
|---|---:|---:|---|
| A — strong original editorial | 14 | 22.6% | Strong editorial was approximately 14% of the old indexable set |
| B — strong tool + supporting content | 20 | 32.3% | Strong tool/content was approximately 9% |
| C — narrow but useful | 13 | 21.0% | Previously mixed with 27% thin supporting content |
| E — legal/trust | 7 | 11.3% | Similar scope, but disclosures are now accurate |
| F — thin/weakly differentiated | 8 | 12.9% | Old Group C+D scaled/thin signal was approximately 39% |

Strong A+B pages now account for **34/62 (54.8%)**. Strong plus useful C pages account for **47/62 (75.8%)**. The approval-facing index is therefore predominantly useful and distinct, and the site now looks more like a real information resource with tools than a scaled landing-page collection. **[INFERENCE]**

The remaining 12.9% thin tier is still large enough to avoid gambling on an immediate resubmission after a low-value rejection. Removing those eight routes from the approval-facing index would leave 54 indexable pages, of which A+B would be 63.0% and A+B+C would be 87.0%.

## 5. Similarity verification

| Scope | Pages | Mean | Maximum | Shared 5-gram ratio | Closest pair |
|---|---:|---:|---:|---:|---|
| Remediated electronics | 8 | 11.6% | 14.5% | 17.6% | Google Pixel / Panasonic |
| Remediated generated cluster | 13 | 18.0% | 24.0% | 25.6% | Trane / Rheem |
| All sitemap pages | 62 | 2.5% | 48.1% | n/a | How Old Is My HVAC / Serial Location Guide |

The top sitewide pairs outside the remediated clusters are:

- `/how-old-is-my-hvac` / `/serial-number-location-guide`: 48.1%
- `/how-old-is-my-plumbing` / `/serial-number-location-guide`: 45.5%
- `/how-old-is-my-hvac` / `/how-old-is-my-plumbing`: 43.4%
- `/how-old-is-my-appliance` / `/how-old-is-my-hvac`: 31.7%
- `/how-to-find-hvac-age` / `/hvac-age-by-serial-number`: 30.5%

Manual inspection shows that these pages share label-location and hard-to-read-label guidance but retain different product families, brand nuances, H1s, user tasks, and destination links. This is legitimate topical overlap plus copied shell/section structure, not the old brand-name substitution pattern. It should be monitored and included in a future generalized similarity regression, but it is not the reason for the final focused batch. **[REPO][INFERENCE]**

## 6. Remaining thin/noindex/manual-review risks

| Routes | Current state | Recommendation | Approval risk |
|---|---|---|---|
| `/appliances`, `/electronics`, `/hvac`, `/water-heaters` | 31–32 words, public `noindex, follow`, not in sitemap, prefilled entry behavior | Keep noindex; add descriptions only if useful for previews, not for approval | Low |
| `/google-pixel`, `/panasonic` | 927/945 words, honest provisional limits, `noindex, follow`, no sitemap or prominent inbound links | Keep public/noindex; permanently deny ads until evidence improves | Low |
| `/dryer-serial-number` | 1,150 words; no verified dryer-specific fixture, and explicitly refuses to fabricate one | Keep indexable; transparency is a positive signal | Low |
| `/decoder-tool`, `/smart-lookup`, `/assistant`, `/large-loss-decoder` | Functioning primary utilities with 63–262 static words | Keep public/indexable; permanently deny page/control/result advertising | Low if ad-free |
| `/analytics-report`, `/brand-page-template` | Internal source only; production 404 | Keep excluded or relocate outside web root | Low |
| `/appliance-age-estimator`, `/replacement-lookup`, `/hvac-replacement-guide`, `/tv-replacement-guide` | 134–167 words; no page-local tool; primarily CTA into stronger tools; 1–11 inbound links | `noindex, follow`, remove from sitemap, retain only where users benefit | Medium |
| `/goodman-model-number-lookup`, `/whirlpool-model-number-lookup`, `/whirlpool-refrigerator-serial-number-lookup`, `/whirlpool-dishwasher-serial-number-lookup` | 228–260 words; 1–3 inbound links; overlaps stronger brand/product pages | Move unique label guidance to parent; then direct redirect, or reversible noindex if kept | Medium |
| About credential claim | Claims a licensed multi-discipline team without auditable support in repo | Owner verifies and documents internally, or copy is softened | Medium |

## 7. Strong approval-facing core (25 pages)

All entries are 200, indexable, in sitemap, self-canonical, statically linked, non-orphaned, mobile/desktop usable except the homepage accuracy issue noted below, and free of unfinished content. **[REPO][PROD]**

| Page | Why it belongs / original value | Trust and internal discovery | Future ads | Remaining issue |
|---|---|---|---|---|
| `/` | Primary deterministic decoder plus substantial brand and FAQ context | 252 inbound; feedback and limits exist below tool | Deny while primarily a tool | H1 overpromises; weak inline editorial/trust path |
| `/methodology` | Source hierarchy, confidence, ambiguity, correction and testing policy | 160 inbound; links feedback/tools | Candidate only as editorial page | Verify “without estimation” wording remains consistent |
| `/electrical-service-panel-history` | Original safety/history timeline | 126 inbound; Article schema | Candidate | None found |
| `/electrical-wiring-history` | Original material/era timeline | 126 inbound; Article schema | Candidate | None found |
| `/hvac-system-history` | Original HVAC evolution and identification context | 125 inbound | Candidate | None found |
| `/water-heater-history` | Original water-heater era/technology history | 124 inbound | Candidate | None found |
| `/major-appliances-history` | Original appliance design/technology timeline | 124 inbound | Candidate | None found |
| `/tv-history` | Original television technology timeline | 136 inbound | Candidate | None found |
| `/computer-history` | Original computer/device history | 134 inbound | Candidate | None found |
| `/how-old-is-my-appliance` | Kitchen/laundry age and label guidance | 159 inbound; links brand/product routes | Candidate after copy fix | “Exact manufacture date” hero claim |
| `/how-old-is-my-hvac` | HVAC-specific label/brand research | 129 inbound | Candidate | Shared label prose; monitor |
| `/how-old-is-my-plumbing` | Water-heater category/serial research | 127 inbound | Candidate | Shared label prose; monitor |
| `/how-old-is-my-electronics` | Identifier limitations and modern-device recovery | 137 inbound | Candidate | None found |
| `/appliance-age-for-insurance-and-replacement` | Distinct insurance/replacement documentation intent | 163 inbound; seven visible/schema FAQs | Candidate | None found |
| `/samsung-serial-number-lookup` | Appliance/TV boundary, tested rules, examples and limitations | 93 inbound; methodology/Smart Lookup | Candidate | None found |
| `/ge-serial-number-lookup` | Tested cycle logic and model-era evidence | 99 inbound | Candidate | None found |
| `/goodman-serial-number-lookup` | HVAC format rules and month/year validation | 94 inbound | Candidate | None found |
| `/carrier-serial-number-lookup` | Bounded Carrier format and cross-brand cautions | 94 inbound | Candidate | None found |
| `/whirlpool-serial-number-lookup` | 9/10-character rules, cycles, weeks and fixtures | 100 inbound | Candidate | None found |
| `/kenmore-serial-number-lookup` | Original OEM-prefix routing workflow | 89 inbound | Candidate | None found |
| `/maytag-serial-number-lookup` | Distinct pre/post-2006 evidence | 89 inbound | Candidate | None found |
| `/frigidaire-serial-number-lookup` | Factory/year/week format with model refinement | 90 inbound | Candidate | None found |
| `/bosch` | Appliance FD/E-Nr/Z-Nr identifier guidance | 49 inbound | Candidate | None found |
| `/samsung-tv-serial-number-decoder` | TV-specific serial cycle and menu recovery | 33 inbound | Candidate | None found |
| `/asus-serial-number-decoder` | Tested character positions and supported-era limits | 32 inbound | Candidate | None found |

## 8. Homepage approval-facing review

What works:

- The first screen clearly offers a deterministic serial-number path and a separate Smart Lookup path.
- Categories and inputs are understandable, mobile controls are usable, and the brand directory uses specific capabilities rather than generic brand names.
- The page includes feedback handling, FAQ content, source/limitation copy, and direct canonical navigation.

What blocks a clean approval-facing judgment:

- “Decode Any Serial Number — Get the Manufacture Date Instantly” conflicts with the site's own unsupported-format and ambiguity disclosures.
- The hero supports “100+ brands” but does not immediately state that support depth varies by brand/era.
- After the tools, the page moves directly into brand links and then the footer. Methodology, About, original history guides, limitations, and correction/reporting are not presented as a compact inline editorial section.

**[INFERENCE]** The homepage feels like a polished, useful tool, but still not quite like the front page of a publisher property with tools. The final batch should replace the certainty claim and add one modest inline “How we research and verify” section linking Methodology, Item History Guides, Serial Number Locations, About, and Feedback. This is not a redesign.

## 9. Publisher trust status

| Area | Status | Risk |
|---|---|---|
| Decode My Item product identity | Header/footer and current generated pages are consistent | Low |
| Item Assist relationship | Clearly explained on About and Methodology | Low |
| Metadata identity | 11 indexable heads retain Item Assist-first metadata/schema | Medium |
| Manufacturer independence | Disclaimer and limitation language avoid endorsement; no fake partnership detected | Low |
| Research methodology | Strong source hierarchy, ambiguity policy, confidence levels and regression process | Low |
| Correction path | Feedback page, contact page and decoder feedback controls exist | Low |
| Contact/support | Public contact and feedback forms plus fallback email | Low |
| Credentials | Licensed adjuster/appraiser/technician team claim cannot be verified from repo or production | Medium/manual |
| Fabricated authors/reviews | None detected | None |

No critical or high publisher-trust defect was found. The metadata and credential issues belong in the final focused batch.

## 10. Privacy, consent, and advertising readiness

### Current state

- Privacy accurately describes GA4, cookies/similar identifiers, browser/device/page/referral/interaction/IP-derived data, API processing, hosting logs, local processing, and monitoring fallback behavior. **[REPO][PROD]**
- Security no longer claims all processing is local or that no third-party scripts exist. **[REPO][PROD]**
- Both pages say the AdSense code is for ownership/readiness and that approved visible units are not active. **[REPO][PROD]**
- The publisher ID is unchanged: `ca-pub-5946778263750869`. **[REPO]**
- `ads.txt` is live and contains `google.com, pub-5946778263750869, DIRECT, f08c47fec0942fa0`, matching Google's documented format. [Google ads.txt guide](https://support.google.com/adsense/answer/12171612?hl=en). **[POLICY][REPO][PROD]**
- Tagged source pages have one loader, never duplicate loaders; no authored `ins.adsbygoogle`, `data-ad-slot`, or visible/blank ad container was found. **[REPO][PROD]**
- Google Pixel and Panasonic contain the ownership loader despite being noindex. This is acceptable only while it remains verification/readiness code and Auto Ads is off; future route gating must deny them. **[INFERENCE]**
- CSP permits the current Google loader, frames, images, and connections and did not break rendering in the production browser review. **[REPO][PROD]**

### Consent plan before any visible advertising

1. Select a Google-certified CMP supporting IAB TCF v2.3 for EEA, UK, and Switzerland traffic. Google requires a certified CMP for personalized ads in those regions. [CMP requirement](https://support.google.com/adsense/answer/13554116?hl=en), [TCF integration](https://support.google.com/adsense/answer/9804260?hl=en). **[POLICY]**
2. Configure a first-layer **Do not consent**, **Consent**, and **Manage options** experience and a persistent privacy-options/revocation link. Google's European message documentation describes those three choices on reopening. [European regulations messages](https://support.google.com/adsense/answer/10961068?hl=en). **[POLICY]**
3. Set consent defaults before GA4/AdSense configuration and update `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization` from the user's choice. Persist choices in first-party storage. [Google Consent Mode implementation](https://developers.google.com/tag-platform/security/guides/consent). **[POLICY]**
4. Configure US state messages/opt-out coverage for all supported current and future states and provide “Do Not Sell or Share”/privacy-options access where applicable. [US state message setup](https://support.google.com/adsense/answer/10960771?hl=en), [supported state messages](https://support.google.com/adsense/answer/10961479?hl=en-EN). **[POLICY]**
5. Decide, document, and test personalized, non-personalized, limited-ad, and restricted-data-processing paths. Limited ads still use network/device information and can use fraud-prevention storage, so they are not equivalent to “no processing.” [Limited ads](https://support.google.com/adsense/answer/14210870?hl=en), [non-personalized requests](https://support.google.com/adsense/answer/11236823?hl=en). **[POLICY]**
6. Load visible-ad code only in production, only after the appropriate consent state, and only on the explicit allowlist. Keep Auto Ads disabled until route exclusions and consent have been tested.
7. Test geographies, consent persistence/revocation, keyboard/screen-reader behavior, Privacy links, and absence of ads on all denylisted routes and states.

Do not activate a CMP or visible ads as part of this audit.

## 11. Technical crawl and indexability

| Check | Result |
|---|---|
| `robots.txt` | 200, allows public pages, blocks API and excluded internal sources, points to canonical sitemap |
| `sitemap.xml` | 200, 62 entries, production identical to repo |
| Sitemap URLs | All return direct 200, self-canonical and indexable |
| Google Pixel / Panasonic | `noindex, follow`; absent from sitemap |
| Removed P0 routes | Branded HTTP 404 |
| Unknown route | Branded HTTP 404, not a homepage redirect |
| Apex HTTPS | 307 to `https://www.decodemyitem.com/` |
| HTTP www | 308 to HTTPS www |
| HTTP apex | HTTPS apex then canonical www; two hops, no loop |
| Internal links | 0 broken; 0 redirecting; 0 indexable orphans |
| Robots/canonical conflicts | 0 |
| Sitemap noindex/redirect/404 entries | 0 |
| Googlebot/AdSense blocking | No broad production block or `X-Robots-Tag`; API and internal sources only are disallowed |
| CSP/rendering | Security header present; representative pages render successfully |

The four intentional noindex category stubs lack meta descriptions. This is not an indexation or approval blocker because they are excluded from the approval-facing index.

## 12. Production browser review

Headless Chromium tested 88 combinations: 11 representative routes at 320, 375, 430, 768, 1024, 1140, 1141, and 1440 px. Routes covered homepage, decoder, Smart Lookup, a strengthened appliance brand, a narrowed product guide, an electronics page, a noindex page, Methodology, Privacy, Security, and branded 404.

Passing observations:

- one header and one H1
- correct responsive menu state
- hamburger opens; `aria-expanded` synchronizes; Escape closes
- desktop Resources menu opens and closes with Escape
- FAQs open
- no empty content sections
- no visible ad or blank ad container
- no viewport overflow on ten of eleven routes at all widths
- generated cards/tables remained readable
- branded unknown route returned 404

Confirmed defect:

- `/privacy-policy`: document scroll width was 391–411 px at 320/375 px. `.policy-table` elements measured 485–496 px; the provider/service tables were compressed into unreadably narrow columns and escaped the viewport. At 430 px the document no longer overflowed, but the table still relied on contained horizontal content.

Local functional Playwright suites separately passed decoder success, ambiguous, conflict, failure, loading, Smart Lookup, semantic date labels, responsive generated pages, and noindex interaction states.

## 13. Search Console and recrawl readiness

This audit has no private Search Console access. The publisher must verify:

- the revised 62-URL sitemap is currently submitted and successful
- after the final batch, the reduced sitemap is resubmitted
- homepage and changed trust pages show a last crawl after the final deployment
- the strongest updated brand/product pages have been recrawled, not merely requested
- removed P0 routes and noindexed Pixel/Panasonic are aging out as expected
- no stale obsolete route remains indexed unexpectedly
- Page Indexing/canonical reports are stabilizing rather than accumulating new “Crawled/Discovered — currently not indexed” pages
- Manual Actions shows none
- Security Issues shows none
- sitemap URL coverage remains reasonable

Google notes that crawling/re-indexing can take from days to weeks and should be observed in Search Console rather than assumed from a fixed deadline. [Search traffic/crawl guidance](https://support.google.com/webmasters/answer/9079473?hl=en), [missing-page/indexing guidance](https://support.google.com/webmasters/answer/7474347?hl=en). **[POLICY]**

## 14. Conservative future ad allowlist

No route is authorized to display ads now. After approval, consent implementation, and a separate placement review, only these editorial areas are candidates:

- Seven history guides: electrical panels, wiring, HVAC, water heaters, major appliances, TVs, computers
- Four category age guides: appliances, HVAC, plumbing/water heaters, electronics
- Three serial research guides: how to read a serial number, how to find HVAC age, HVAC age by serial number
- Methodology
- Find Model & Serial Number
- Appliance Age for Insurance and Replacement
- Retained substantive generated pages: Samsung, GE, Goodman, Carrier, Whirlpool, LG, Frigidaire, Maytag, Kenmore, Trane, Rheem HVAC, ASUS, Apple, HP, Sony, Bosch, Vizio, Samsung TV, refrigerator, washer, dryer, dishwasher, range/oven

Even on allowlisted pages, placements must stay outside forms, CTA clusters, navigation, result panels, ambiguity/conflict panels, error/loading states, accordions while opening, and feedback controls.

## 15. Future ad denylist

- Homepage while the primary decoder/Smart Lookup controls remain its focal point
- `/decoder-tool`, `/smart-lookup`, `/assistant`, `/large-loss-decoder`
- `/brands`, `/item-history-guides` hub navigation areas
- `/appliance-age-estimator`, `/replacement-lookup`, `/hvac-replacement-guide`, `/tv-replacement-guide`
- four thin model/sub-brand pages pending their final disposition
- `/404` and all unknown/error routes
- Privacy, Security, Disclaimer, About, Contact, Feedback
- Google Pixel, Panasonic and all other noindex routes
- all legacy redirects and excluded internal/demo files
- AI conversation areas, form controls, decoder/Smart Lookup results, loading, retry, unavailable, conflict, and feedback states

## 16. Exact final focused batch

1. **Approval-facing route set:** add exactly one `noindex, follow` to the four CTA-only estimator/replacement pages; remove them from sitemap and prominent discovery. For the four model/sub-brand pages, move any unique label guidance to the stronger parent and redirect directly, or use reversible `noindex, follow` while compatibility is assessed. Do not delete useful public utilities.
2. **Homepage accuracy/trust:** replace “any/instantly” certainty with supported-format estimate language; add one compact inline section linking Methodology, Item History Guides, Serial Locations, About, and Feedback.
3. **Brand identity:** normalize title, description, OG, Twitter, and schema publisher/product naming on the eleven Item Assist-first heads. Keep Item Assist only as provider context in body copy.
4. **Privacy mobile table:** wrap `.policy-table` in local horizontal-scrolling containers or convert it to accessible mobile cards; assert no document overflow at 320/375 and preserve table semantics/readability.
5. **Credential verification:** the publisher confirms the About credentials are factual and supportable, or softens the sentence. Do not invent names, licenses, or biographies.
6. **Regression coverage:** enforce the final sitemap/noindex decisions, homepage limitation wording, metadata identity, Privacy overflow at all eight widths, and no ad code/units on denylisted routes beyond the required ownership loader.

Expected approval-facing sitemap after the recommended reversible noindex treatment: **54 URLs**, subject to the final model/sub-brand disposition.

## 17. Validation results

- `npm run build:seo` twice — pass; empty diff both times
- `npm run build` twice — pass; empty diff both times
- `npm test` — pass: 141 decoder, 231 refinement/content, 48 API tests
- `npm run test:smart-unit` — 67 passed
- `npm run test:smart-api` — 21 passed
- `npm run test:playwright` — 30 passed on full rerun
- `npm run test:smart-playwright` — 15 passed
- `node scripts/audit/site-audit.mjs` — pass; four expected noindex-stub description notices only
- `node scripts/audit/generated-page-similarity.mjs --enforce` — pass
- `node scripts/audit/electronics-page-similarity.mjs --enforce` — pass
- FAQ visible/schema audit — 34 schema pages, 177 questions, zero missing visible questions
- Production route crawl — 89 root files, zero unexpected errors/body mismatches
- Production viewport review — 88 checks; Privacy overflow is the sole layout defect
- `node scripts/audit/decoder-invariant-sweep.mjs` — expected nonzero baseline: 92 brands, 6,624 calls, 2,654 successes, 135 fatal and 994 informational findings; identical to the pre-audit main baseline and no decoder files changed
- `git diff --check` — pass after documentation creation

The first local four-worker Playwright run timed out one existing refinement case at 120 seconds without an assertion failure. The exact case passed alone in 5.2 seconds, and the complete rerun passed 30/30. No timeout or decoder change was made.

## 18. Reapplication checklist

### Repository complete

- [x] P0 obsolete/unfinished/disclosure issues fixed
- [x] Electronics and generated clusters remediated and regression-tested
- [x] Build/generator deterministic
- [ ] Final eight-route disposition encoded in sitemap, robots and tests
- [ ] Homepage accuracy/trust section corrected
- [ ] Eleven metadata heads normalized
- [ ] Privacy small-mobile overflow fixed and tested
- [ ] About credential claim verified or softened

### Production verified

- [x] Latest main deployment successful and source-aligned
- [x] Canonical host, HTTPS, robots, current sitemap and branded 404 healthy
- [x] No visible ads or blank units
- [ ] Final focused batch deployed
- [ ] Reduced sitemap and changed production bodies match final commit
- [ ] Privacy passes 320/375 production browser review

### Search Console/manual verification

- [ ] Final sitemap submitted successfully
- [ ] Homepage and strongest changed pages crawled after final deployment
- [ ] No Manual Actions
- [ ] No Security Issues
- [ ] No unexpected stale obsolete URLs indexed
- [ ] No new sitemap/noindex/canonical mismatch
- [ ] Page Indexing reports have had time to reflect the revised set

### AdSense account verification

- [ ] Site still shows only the expected “Low value content” issue
- [ ] Publisher ID matches repo and ads.txt
- [ ] ads.txt status is Authorized/healthy in the account
- [ ] Auto Ads remains off
- [ ] No account setting would activate ads immediately upon approval

### Consent/privacy preparation

- [ ] Google-certified TCF v2.3 CMP selected
- [ ] EEA/UK/Switzerland consent, reject and manage flows designed
- [ ] US state opt-out/privacy-options plan defined
- [ ] Consent Mode defaults/updates and persistence specified
- [ ] Personalized/non-personalized/limited/RDP behavior documented
- [ ] Production-only route allowlist and denylist tests ready

### Safe to resubmit

- [ ] Every repository and production item above is complete
- [ ] Search Console shows the final changes were recrawled
- [ ] Publisher manually reviews homepage, Privacy, About, all eight final-disposition routes, Pixel and Panasonic
- [ ] Evidence bundle saved: final SHA, deployment URL/time, CI links, production crawl summary, sitemap copy, screenshots, Search Console last-crawl dates, Manual Actions/Security screenshots, and AdSense issue screenshot

Only then is it accurate to check **“I confirm I have fixed the issues.”** That check should mean the final batch is live, the approval-facing set has been recrawled, and the publisher has manually verified Search Console and AdSense account conditions—not merely that local tests passed.

### Do not do yet

- Do not request AdSense review now.
- Do not check the confirmation box now.
- Do not activate Auto Ads, manual units, blank placeholders, or a CMP in this audit branch.
- Do not add generic content or new SEO pages to compensate for the eight weak routes.
- Do not noindex strong pages solely because Google has not indexed them yet.

## 19. Uncertainty preventing a stronger verdict

- Google's private approval rationale and review weighting are unavailable.
- Search Console, AdSense account settings, ads.txt account status, manual actions, security issues and last-crawl dates require publisher access.
- The About credential claim cannot be independently verified from public/repository evidence.
- The ownership loader could permit future Auto Ads behavior depending on account settings; production currently shows no ads, but the account-side Auto Ads state is not observable here.
- Similarity measures are screening tools. The high category-guide pairs were manually reviewed, but Google may evaluate topical overlap differently.

## Appendix A — complete route inventory

+| Route | HTTP | Source | Gen | Robots / map | Canonical | Title | H1 | Words / unique | Tool/static/no-JS/no-decoder | Ex/source | FAQ/schema | In | Purpose / task | Q | Index rec. | Ads | Risk |
|---|---:|---|:---:|---|---|---|---|---:|---|---|---|---:|---|:---:|---|---|---|
| / | 200 | index.html | N | index, follow, max-image-preview:large / Y | self | Serial Number Decoder — Appliances, HVAC & Electronics \| Decode My Item | Decode Any Serial Number — Get the Manufacture Date Instantly | 961 / H | Y/Y/N/Y | — | 3/3 ✓ | 252 | Run deterministic serial decoder | B | Keep | Deny | Med |
| /404.html | 308→200 | 404.html | N | noindex, nofollow / N | — | Page Not Found \| Decode My Item | We couldn’t find that page. | 36 / L | N/N/N/N | — | — | 0 | Recover from unknown URL | D | Keep noindex | Deny | Low |
| /about | 200 | about.html | N | index, follow, max-image-preview:large / Y | self | About Decode My Item — Serial Number Decoder & Age Lookup | &#128101; Who We Are | 365 / H | N/Y/Y/Y | — | — | 124 | Trust, legal, or data disclosure | E | Keep | Deny | Low |
| /analytics-report | 404 | analytics-report.html | N | noindex, nofollow / N | — | Analytics Report \| Item Assist | Local analytics reporting dashboard | 44 / L | N/N/N/N | — | — | 0 | Internal/demo source; not deployed | G | Remove from output | Deny | Low |
| /apple | 200 | apple.html | Y | index, follow, max-image-preview:large / Y | self | Apple Serial Number and Model Identification Guide \| Decode My Item | Apple Serial Number and Model Identification Guide | 1058 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 30 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /appliance-age-by-serial-number | 308→200 | appliance-age-by-serial-number.html | N | redirect / N | → /how-old-is-my-appliance | Appliance Age by Serial Number | Appliance Age by Serial Number | 482 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /appliance-age-estimator | 200 | appliance-age-estimator.html | N | index* / Y | self | Appliance Age Estimator \| Item Assist | Estimate appliance age from serial or model context | 134 / L | N/N/N/N | — | — | 1 | Appliance Age Estimator | F | Remove map; consolidate/noindex | Deny | Med |
| /appliance-age-for-insurance-and-replacement | 200 | appliance-age-for-insurance-and-replacement.html | Y | index, follow, max-image-preview:large / Y | self | Appliance Age for Insurance Claims & Replacement \| Decode My Item | Why Appliance Age Matters for Insurance, Repair & Replacement | 1340 / H | Y/Y/Y/Y | Y / repo | 7/7 ✓ | 163 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /appliances | 200 | appliances.html | N | noindex, follow / N | https://www.decodemyitem.com/ | Appliances Decoder Redirect | Opening the current decoder? | 31 / L | N/N/N/N | — | — | 7 | Prefilled category entry | D | Keep noindex | Deny | Low |
| /assistant | 200 | assistant.html | N | index* / Y | self | AI Assistant &mdash; Decode My Item | Ask Anything About Your Appliance or Device | 124 / M | Y/N/N/N | — | — | 123 | Run AI-assisted model/age research | C | Keep | Deny | Low |
| /asus | 308→200 | asus.html | N | redirect / N | → /asus-serial-number-decoder | ASUS Serial Number Decoder \| Decode My Item | ASUS Serial Number Decoder | 1055 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /asus-serial-number-decoder | 200 | asus-serial-number-decoder.html | Y | index, follow, max-image-preview:large / Y | self | ASUS Serial Number Manufacture Date Decoder \| Decode My Item | ASUS Serial Number Lookup & Model Number Help | 1163 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 32 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /bosch | 200 | bosch.html | Y | index, follow, max-image-preview:large / Y | self | Bosch Appliance FD Number and Serial Date Guide \| Decode My Item | Bosch Appliance FD Number and Serial Date Guide | 980 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 49 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /brand-page-template | 404 | brand-page-template.html | N | noindex, nofollow / N | — | Decode [BRAND] Serial Numbers -- Find Manufacture Date \| Decode My Item | Decode [BRAND] Serial Numbers Instantly | 297 / L | N/Y/Y/Y | — | — | 0 | Internal/demo source; not deployed | G | Remove from output | Deny | Low |
| /brands | 200 | brands.html | N | index, follow, max-image-preview:large / Y | self | Supported Brands – Serial Number Decoder | &#128202; Supported Brands | 264 / M | N/Y/Y/Y | — | — | 66 | Navigate to a supported resource | C | Keep | Deny | Low |
| /carrier | 308→200 | carrier.html | N | redirect / N | → /carrier-serial-number-lookup | Carrier Serial Number Decoder \| Decode My Item | Carrier Serial Number Decoder | 1058 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /carrier-serial-number-lookup | 200 | carrier-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Carrier Serial Number Lookup — HVAC Age & Manufacture Date \| Decode My Item | Carrier Serial Number Decoder | 1667 / H | Y/Y/Y/Y | Y / repo | 9/9 ✓ | 94 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /computer-history | 200 | computer-history.html | N | index, follow / Y | self | Computer History: Mainframes, Home Computers, Desktop PCs, Laptops, Modern Devices \| Decode My Item | 💻 Computer History | 846 / H | N/Y/Y/Y | — | — | 134 | Research product/system history and era | A | Keep | Candidate | Low |
| /contact | 200 | contact.html | N | index, follow, max-image-preview:large / Y | self | Contact - Item Assist | Contact Us | 140 / H | N/N/N/N | — | — | 131 | Contact/correction path | E | Keep | Deny | Med |
| /decoder-tool | 200 | decoder-tool.html | N | index* / Y | self | Serial Number Decoder Tool — Free Appliance & HVAC Lookup \| Decode My Item | Find Your Appliance's Manufacture Date Instantly | 262 / M | Y/Y/N/Y | — | — | 133 | Run deterministic serial decoder | C | Keep | Deny | Low |
| /disclaimer | 200 | disclaimer.html | N | index, follow, max-image-preview:large / Y | self | Disclaimer – Serial Number Decoder | &#9888; Disclaimer | 395 / H | N/Y/Y/Y | — | — | 4 | Trust, legal, or data disclosure | E | Keep | Deny | Low |
| /dishwasher-serial-number | 200 | dishwasher-serial-number.html | Y | index, follow, max-image-preview:large / Y | self | Dishwasher Model and Serial Number Label Guide \| Decode My Item | Dishwasher Model and Serial Number Label Guide | 1187 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 89 | Locate label and choose manufacturer path | C | Keep | Candidate | Low |
| /dishwasher-serial-number-lookup | 308→200 | dishwasher-serial-number-lookup.html | N | redirect / N | → /dishwasher-serial-number | Dishwasher Serial Number Lookup (Find Manufacture Date Instantly) | Dishwasher Serial Number Decoder | 454 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /dryer-serial-number | 200 | dryer-serial-number.html | Y | index, follow, max-image-preview:large / Y | self | Dryer Model and Serial Number Label Guide \| Decode My Item | Dryer Model and Serial Number Label Guide | 1150 / H | Y/Y/Y/Y | 0 / explicit | 6/6 ✓ | 86 | Locate label and choose manufacturer path | C | Keep | Candidate | Low |
| /dryer-serial-number-lookup | 308→200 | dryer-serial-number-lookup.html | N | redirect / N | → /dryer-serial-number | Dryer Serial Number Lookup (Find Manufacture Date Instantly) | Dryer Serial Number Decoder | 445 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /electrical-service-panel-history | 200 | electrical-service-panel-history.html | N | index, follow, max-image-preview:large / Y | self | Electrical Service Panel History: Fuse Boxes & Breaker Panels \| Decode My Item | Electrical Service Panel History | 786 / H | N/Y/Y/Y | — | — | 126 | Research product/system history and era | A | Keep | Candidate | Low |
| /electrical-wiring-history | 200 | electrical-wiring-history.html | N | index, follow, max-image-preview:large / Y | self | Electrical Wiring History: Knob-and-Tube, Cloth, Aluminum, Copper NM Cable \| Decode My Item | Electrical Wiring History | 1006 / H | N/Y/Y/Y | — | — | 126 | Research product/system history and era | A | Keep | Candidate | Low |
| /electronics | 200 | electronics.html | N | noindex, follow / N | https://www.decodemyitem.com/ | Electronics Decoder Redirect | Opening the current decoder? | 31 / L | N/N/N/N | — | — | 8 | Prefilled category entry | D | Keep noindex | Deny | Low |
| /feedback | 200 | feedback.html | N | index, follow, max-image-preview:large / Y | self | Feedback &amp; Bugs - Item Assist | Feedback &amp; Bugs | 59 / H | N/N/N/N | — | — | 2 | Contact/correction path | E | Keep | Deny | Med |
| /find-model-serial-number | 200 | find-model-serial-number.html | N | index, follow, max-image-preview:large / Y | self | Where to Find Model and Serial Numbers on Appliances, HVAC, TVs & More \| Decode My Item | Find Your Model &amp; Serial Number | 643 / H | N/Y/Y/Y | — | 3/3 ✓ | 62 | Where to Find Model and Serial Numbers on Appliances, HVAC, TVs & More | C | Keep | Candidate | Low |
| /frigidaire | 308→200 | frigidaire.html | N | redirect / N | → /frigidaire-serial-number-lookup | Frigidaire Serial Number Decoder \| Decode My Item | Frigidaire Serial Number Decoder | 1056 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /frigidaire-serial-number-lookup | 200 | frigidaire-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Frigidaire Serial Number Decoder \| Decode My Item | Frigidaire Serial Number Decoder | 1134 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 90 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /ge | 308→200 | ge.html | N | redirect / N | → /ge-serial-number-lookup | GE Serial Number Decoder \| Decode My Item | GE Serial Number Decoder | 1066 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /ge-serial-number-lookup | 200 | ge-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | GE Serial Number Lookup — Manufacture Date Decoder \| Decode My Item | GE Serial Number Decoder | 1522 / H | Y/Y/Y/Y | Y / repo | 9/9 ✓ | 99 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /goodman | 308→200 | goodman.html | N | redirect / N | → /goodman-serial-number-lookup | Goodman Serial Number Decoder \| Decode My Item | Goodman Serial Number Decoder | 1064 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /goodman-model-number-lookup | 200 | goodman-model-number-lookup.html | N | index, follow, max-image-preview:large / Y | self | Goodman Model Number Lookup \| Item Assist | Goodman model number lookup when the serial number is unavailable | 235 / L | N/Y/Y/Y | — | 2/2 ✓ | 3 | Goodman Model Number Lookup | F | Remove map; consolidate/noindex | Deny | Med |
| /goodman-serial-number-lookup | 200 | goodman-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Goodman Serial Number Lookup — HVAC Age & Manufacture Date \| Decode My Item | Goodman Serial Number Decoder | 1559 / H | Y/Y/Y/Y | Y / repo | 9/9 ✓ | 94 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /google-pixel | 200 | google-pixel.html | Y | noindex, follow / N | self | Google Pixel Identifier and Serial Number Guide \| Decode My Item | Google Pixel Identifier and Serial Number Guide | 927 / M | Y/Y/Y/Y | — | 5/— | 0 | Identifier research under evidence review | D | Keep noindex | Deny | Low |
| /how-old-is-my-appliance | 200 | how-old-is-my-appliance.html | N | index* / Y | self | How Old Is My Appliance? Find Out by Serial Number \| Decode My Item | How Old Is My Appliance? Find Out by Serial Number | 626 / H | N/Y/Y/Y | — | — | 159 | How Old Is My Appliance? Find Out by Serial Number | A | Keep | Candidate | Med |
| /how-old-is-my-electronics | 200 | how-old-is-my-electronics.html | N | index* / Y | self | How Old is My Electronics \| Decode My Item | How Old is My Electronics? | 594 / H | N/Y/Y/Y | — | — | 137 | How Old is My Electronics | A | Keep | Candidate | Low |
| /how-old-is-my-hvac | 200 | how-old-is-my-hvac.html | N | index* / Y | self | How Old is My HVAC \| Decode My Item | How Old is My HVAC System? | 392 / H | N/Y/Y/Y | — | — | 129 | How Old is My HVAC | A | Keep | Candidate | Low |
| /how-old-is-my-plumbing | 200 | how-old-is-my-plumbing.html | N | index* / Y | self | How Old is My Water Heater \| Decode My Item | How Old is My Water Heater? | 407 / H | N/Y/Y/Y | — | — | 127 | How Old is My Water Heater | A | Keep | Candidate | Low |
| /how-to-find-hvac-age | 200 | how-to-find-hvac-age.html | N | index, follow, max-image-preview:large / Y | self | How to Find HVAC Age by Serial Number | How to Find HVAC Age | 488 / H | N/Y/Y/Y | — | 3/3 ✓ | 86 | How to Find HVAC Age by Serial Number | A | Keep | Candidate | Low |
| /how-to-read-serial-number | 200 | how-to-read-serial-number.html | N | index, follow, max-image-preview:large / Y | self | How to Read a Serial Number for Appliance and HVAC Age | How to Read a Serial Number | 489 / H | N/Y/Y/Y | — | 3/3 ✓ | 123 | How to Read a Serial Number for Appliance and HVAC Age | A | Keep | Candidate | Low |
| /hp | 200 | hp.html | Y | index, follow, max-image-preview:large / Y | self | HP Serial Number Date Code and Product ID Guide \| Decode My Item | HP Serial Number Date Code and Product ID Guide | 1005 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 31 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /hvac | 200 | hvac.html | N | noindex, follow / N | https://www.decodemyitem.com/ | HVAC Decoder Redirect | Opening the current decoder? | 31 / L | N/N/N/N | — | — | 7 | Prefilled category entry | D | Keep noindex | Deny | Low |
| /hvac-age-by-serial-number | 200 | hvac-age-by-serial-number.html | N | index, follow, max-image-preview:large / Y | self | HVAC Age by Serial Number | HVAC Age by Serial Number | 462 / H | N/Y/Y/Y | — | 3/3 ✓ | 87 | HVAC Age by Serial Number | A | Keep | Candidate | Low |
| /hvac-replacement-guide | 200 | hvac-replacement-guide.html | N | index* / Y | self | HVAC Replacement Guide \| Item Assist | HVAC replacement research for older systems | 153 / L | N/Y/Y/Y | — | — | 1 | HVAC Replacement Guide | F | Remove map; consolidate/noindex | Deny | Med |
| /hvac-system-history | 200 | hvac-system-history.html | N | index, follow, max-image-preview:large / Y | self | HVAC System History: Furnaces, Air Conditioning, Heat Pumps \| Decode My Item | ❄️ HVAC System History | 1254 / H | N/Y/Y/Y | — | — | 125 | Research product/system history and era | A | Keep | Candidate | Low |
| /item-history-guides | 200 | item-history-guides.html | N | index, follow, max-image-preview:large / Y | self | Item History Guides: Property System Timelines \| Decode My Item | Item History Guides | 342 / M | N/Y/Y/Y | — | — | 137 | Research product/system history and era | C | Keep | Deny | Low |
| /kenmore | 308→200 | kenmore.html | N | redirect / N | → /kenmore-serial-number-lookup | Kenmore Serial Number Decoder \| Decode My Item | Kenmore Serial Number Decoder | 1059 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /kenmore-serial-number-lookup | 200 | kenmore-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Kenmore Serial Number Decoder \| Decode My Item | Kenmore Serial Number Decoder | 1320 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 89 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /large-loss-decoder | 200 | large-loss-decoder.html | N | index* / Y | self | Large Loss Decoder — Bulk Serial Number Lookup for Insurance Claims \| Decode My Item | Large Loss Decoder | 63 / M | Y/N/N/N | — | — | 123 | Batch-decode asset serials | C | Keep | Deny | Low |
| /lg | 308→200 | lg.html | N | redirect / N | → /lg-serial-number-lookup | LG Serial Number Decoder \| Decode My Item | LG Serial Number Decoder | 1063 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /lg-serial-number-lookup | 200 | lg-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | LG Serial Number Decoder \| Decode My Item | LG Serial Number Decoder | 1179 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 93 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /major-appliances-history | 200 | major-appliances-history.html | N | index, follow / Y | self | Major Appliances History: Refrigerators, Washers, Dryers, Ranges, Dishwashers \| Decode My Item | 🍳 Major Appliances History | 797 / H | N/Y/Y/Y | — | — | 124 | Research product/system history and era | A | Keep | Candidate | Low |
| /maytag | 308→200 | maytag.html | N | redirect / N | → /maytag-serial-number-lookup | Maytag Serial Number Decoder \| Decode My Item | Maytag Serial Number Decoder | 1062 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /maytag-serial-number-lookup | 200 | maytag-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Maytag Serial Number Decoder \| Decode My Item | Maytag Serial Number Decoder | 1161 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 89 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /methodology | 200 | methodology.html | N | index, follow, max-image-preview:large / Y | self | Methodology – Decode My Item | Our Methodology | 1113 / H | N/Y/Y/Y | — | — | 160 | Understand research and limits | E | Keep | Deny | Low |
| /oven-serial-number-lookup | 308→200 | oven-serial-number-lookup.html | N | redirect / N | → /range-oven-serial-number | Oven Serial Number Lookup (Find Manufacture Date Instantly) | Oven Serial Number Decoder | 445 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /panasonic | 200 | panasonic.html | Y | noindex, follow / N | self | Panasonic Model and Serial Number Location Guide \| Decode My Item | Panasonic Model and Serial Number Location Guide | 945 / M | Y/Y/Y/Y | — | 5/— | 0 | Identifier research under evidence review | D | Keep noindex | Deny | Low |
| /privacy-policy | 200 | privacy-policy.html | N | index, follow, max-image-preview:large / Y | self | Privacy Policy \| Decode My Item | &#128274; Privacy Policy | 1631 / H | N/Y/Y/Y | — | — | 68 | Trust, legal, or data disclosure | E | Keep | Deny | Med |
| /range-oven-serial-number | 200 | range-oven-serial-number.html | Y | index, follow, max-image-preview:large / Y | self | Range and Oven Model and Serial Number Guide \| Decode My Item | Range and Oven Model and Serial Number Guide | 1148 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 68 | Locate label and choose manufacturer path | C | Keep | Candidate | Low |
| /refrigerator-serial-number | 200 | refrigerator-serial-number.html | Y | index, follow, max-image-preview:large / Y | self | Refrigerator Serial Number and Label Guide \| Decode My Item | Refrigerator Serial Number and Label Guide | 1237 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 92 | Locate label and choose manufacturer path | C | Keep | Candidate | Low |
| /refrigerator-serial-number-lookup | 308→200 | refrigerator-serial-number-lookup.html | N | redirect / N | → /refrigerator-serial-number | Refrigerator Serial Number Lookup (Find Manufacture Date Instantly) | Refrigerator Serial Number Decoder | 471 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /replacement-lookup | 200 | replacement-lookup.html | N | index* / Y | self | Replacement Lookup Guide \| Item Assist | Replacement lookup for older appliances, TVs, HVAC, and general property items | 167 / L | N/Y/Y/Y | — | — | 1 | Replacement Lookup Guide | F | Remove map; consolidate/noindex | Deny | Med |
| /rheem | 308→200 | rheem.html | N | redirect / N | → /rheem-serial-number-lookup | Rheem Serial Number Decoder \| Decode My Item | Rheem Serial Number Decoder | 1062 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /rheem-serial-number-lookup | 200 | rheem-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Rheem HVAC Serial Number Decoder \| Decode My Item | Rheem HVAC Serial Number Decoder | 1138 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 91 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /samsung | 308→200 | samsung.html | N | redirect / N | → /samsung-serial-number-lookup | Samsung Serial Number Decoder \| Decode My Item | Samsung Serial Number Decoder | 1076 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /samsung-serial-number-lookup | 200 | samsung-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Samsung Serial Number Lookup — Manufacture Date & Age \| Decode My Item | Samsung Serial Number Decoder | 1606 / H | Y/Y/Y/Y | Y / repo | 8/8 ✓ | 93 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /samsung-tv-serial-number-decoder | 200 | samsung-tv-serial-number-decoder.html | Y | index, follow, max-image-preview:large / Y | self | Samsung TV Serial Number Decoder and Model Guide \| Decode My Item | Samsung TV Serial Number Decoder and Model Guide | 1024 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 33 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /security | 200 | security.html | N | index, follow, max-image-preview:large / Y | self | Security &amp; Data Notice – Item Assist | Security &amp; Data Notice | 390 / H | N/Y/Y/Y | — | — | 123 | Trust, legal, or data disclosure | E | Keep | Deny | Med |
| /serial-number-location-guide | 200 | serial-number-location-guide.html | N | index* / Y | self | Serial Number Location Guide \| Decode My Item | Where to Find the Serial Number on Any Appliance | 294 / M | N/Y/Y/Y | — | — | 155 | Serial Number Location Guide | C | Keep | Deny | Low |
| /smart-lookup | 200 | smart-lookup.html | N | index* / Y | self | Smart Lookup &mdash; Decode My Item | Smart Lookup | 124 / M | Y/N/N/N | — | — | 226 | Run AI-assisted model/age research | C | Keep | Deny | Low |
| /sony | 200 | sony.html | Y | index, follow, max-image-preview:large / Y | self | Sony TV Model Number Year Guide \| Decode My Item | Sony TV Model Number Year Guide | 965 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 30 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /trane | 308→200 | trane.html | N | redirect / N | → /trane-serial-number-lookup | Trane Serial Number Decoder \| Decode My Item | Trane Serial Number Decoder | 1054 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /trane-serial-number-lookup | 200 | trane-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Trane Serial Number Decoder \| Decode My Item | Trane Serial Number Decoder | 1142 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 90 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /tv-history | 200 | tv-history.html | N | index, follow / Y | self | TV History: CRT, Plasma, LCD, LED, OLED, 4K Smart Televisions \| Decode My Item | 📺 TV History | 757 / H | N/Y/Y/Y | — | — | 136 | Research product/system history and era | A | Keep | Candidate | Low |
| /tv-replacement-guide | 200 | tv-replacement-guide.html | N | index* / Y | self | TV Replacement Guide \| Item Assist | Find a current TV replacement for an older model | 148 / L | N/N/N/N | — | — | 11 | TV Replacement Guide | F | Remove map; consolidate/noindex | Deny | Med |
| /vizio | 200 | vizio.html | Y | index, follow, max-image-preview:large / Y | self | Vizio TV Model Number Year Guide \| Decode My Item | Vizio TV Model Number Year Guide | 930 / H | Y/Y/Y/Y | Y / repo | 5/5 ✓ | 29 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
| /washer-serial-number | 200 | washer-serial-number.html | Y | index, follow, max-image-preview:large / Y | self | Washer Model and Serial Number Label Guide \| Decode My Item | Washer Model and Serial Number Label Guide | 1206 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 89 | Locate label and choose manufacturer path | C | Keep | Candidate | Low |
| /washer-serial-number-lookup | 308→200 | washer-serial-number-lookup.html | N | redirect / N | → /washer-serial-number | Washer Serial Number Lookup (Find Manufacture Date Instantly) | Washer Serial Number Decoder | 457 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /water-heater-history | 200 | water-heater-history.html | N | index, follow, max-image-preview:large / Y | self | Water Heater History: Tank, Tankless, Power Vent, Heat Pump \| Decode My Item | 💧 Water Heater History | 1125 / H | N/Y/Y/Y | — | — | 124 | Research product/system history and era | A | Keep | Candidate | Low |
| /water-heaters | 200 | water-heaters.html | N | noindex, follow / N | https://www.decodemyitem.com/ | Water Heaters Decoder Redirect | Opening the current decoder? | 32 / L | N/N/N/N | — | — | 1 | Prefilled category entry | D | Keep noindex | Deny | Low |
| /whirlpool | 308→200 | whirlpool.html | N | redirect / N | → /whirlpool-serial-number-lookup | Whirlpool Serial Number Decoder \| Decode My Item | Whirlpool Serial Number Decoder | 1083 / L | N/Y/Y/Y | — | 3/3 ✓ | 0 | Legacy compatibility redirect | H | Keep redirect | Deny | Low |
| /whirlpool-dishwasher-serial-number-lookup | 200 | whirlpool-dishwasher-serial-number-lookup.html | N | index, follow, max-image-preview:large / Y | self | Whirlpool Dishwasher Serial Number Lookup \| Decode My Item | Whirlpool dishwasher serial number lookup for age and manufacture date | 228 / L | N/Y/Y/Y | — | 2/2 ✓ | 1 | Whirlpool Dishwasher Serial Number Lookup | F | Remove map; consolidate/noindex | Deny | Med |
| /whirlpool-model-number-lookup | 200 | whirlpool-model-number-lookup.html | N | index, follow, max-image-preview:large / Y | self | Whirlpool Model Number Lookup \| Item Assist | Whirlpool model number lookup when the serial number is missing | 260 / L | N/Y/Y/Y | — | 3/3 ✓ | 2 | Whirlpool Model Number Lookup | F | Remove map; consolidate/noindex | Deny | Med |
| /whirlpool-refrigerator-serial-number-lookup | 200 | whirlpool-refrigerator-serial-number-lookup.html | N | index, follow, max-image-preview:large / Y | self | Whirlpool Refrigerator Serial Number Lookup \| Decode My Item | Whirlpool refrigerator serial number lookup for age and manufacture date | 240 / L | N/Y/Y/Y | — | 2/2 ✓ | 1 | Whirlpool Refrigerator Serial Number Lookup | F | Remove map; consolidate/noindex | Deny | Med |
| /whirlpool-serial-number-lookup | 200 | whirlpool-serial-number-lookup.html | Y | index, follow, max-image-preview:large / Y | self | Whirlpool Serial Number Decoder — Year Code & Week \| Decode My Item | Whirlpool Serial Number Decoder | 1193 / H | Y/Y/Y/Y | Y / repo | 6/6 ✓ | 100 | Decode or identify the named brand with limits | B | Keep | Candidate | Low |
