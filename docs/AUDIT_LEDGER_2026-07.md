# Site Foundation Audit Ledger — July 2026

Branch: `audit/seo-decoder-site-foundation` · Starting SHA: `e0e8b34fe01d309f2f303201f5cf1c689f665a65`
Audit tool: `scripts/audit/site-audit.mjs` (models Vercel cleanUrls + vercel.json redirects/rewrites)

Baseline (before fixes): build ✅ · decoder tests 129/129 ✅ · refinement unit 35/35 ✅ · API 34/34 ✅ · smart-lookup unit 66/66 ✅

## Confirmed defects

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| C1 | HIGH | `/where-is-my-serial-number` linked from 19 indexable pages ("Where Is My Serial Number?" related-links block) returns live 404. Correct target `/serial-number-location-guide` exists and returns 200. | `curl` live: 404 / 200; audit tool broken-link scan |
| C2 | HIGH | sitemap.xml contains 5 URLs that 308-redirect (`*-serial-number-lookup` category variants → `*-serial-number`). Sitemap must list final URLs only. | vercel.json redirects vs sitemap.xml |
| C3 | MED | `/brands` links to 13+ retired brand routes (`/ge`, `/whirlpool`, `/samsung`, …) that 308-redirect to `*-serial-number-lookup` pages. Internal links should point at final URLs. | audit tool redirected-link scan |
| C4 | MED | 18 live pages link `/appliance-age-by-serial-number` which 308-redirects to `/how-old-is-my-appliance`. | audit tool |
| C5 | MED | 118 internal links use `.html` suffix (brand-page template family: `replacement-lookup.html`, `appliance-age-estimator.html`, `tv-replacement-guide.html`, `hvac-replacement-guide.html`, `/index.html?cat=…`). With cleanUrls each is a 308 hop. | audit tool |
| C6 | MED | Missing canonical tags on indexable pages: `/how-old-is-my-appliance`, `/how-old-is-my-hvac`, `/how-old-is-my-plumbing`, `/how-old-is-my-electronics`, `/smart-lookup`, `/large-loss-decoder`, `/serial-number-location-guide`. | audit tool head parse |
| C7 | MED | Missing meta descriptions on the same guide pages + `/smart-lookup`, `/serial-number-location-guide`. | audit tool |
| C8 | MED | Duplicate H1 "⚡ Serial Number Decoder" (header brand element marked up as `<h1>`) on `/about`, `/brands`, `/disclaimer`, `/privacy-policy`; page topic has no H1 of its own. | audit tool |
| C9 | LOW | Orphan pages (no inbound internal links): `/whirlpool-refrigerator-serial-number-lookup`, `/whirlpool-dishwasher-serial-number-lookup`. In sitemap only. | audit tool |
| C10 | LOW | No redirect exists for `/where-is-my-serial-number` even though it has been linked sitewide (already crawled as 404). | live 404 |

## Likely defects requiring verification

| # | Finding | Verification plan |
|---|---------|-------------------|
| V1 | Decoder systemic risks: future-year mapping, week>53 acceptance, case/punctuation sensitivity across 100+ brands. | Invariant sweep harness against decoder-data.js (Phase 3) |
| V2 | Analytics events may not cover decode_fail / smart lookup outcomes; possible raw-serial leakage into GA params. | grep gtag( calls in script.js / controllers (Phase 8) |
| V3 | AdSense script loads sitewide with (apparently) no placed units — possible auto-ads reliance. | check ads.txt + `adsbygoogle` ins units (Phase 6) |

## Improvement opportunities (not defects)

- Category pages (`/appliances`, `/hvac`, `/electronics`, `/water-heaters`) are deliberately `noindex, follow`. Flipping to index is a content-strategy call, not a repair. Left unchanged.
- Item Assist ↔ DecodeMyItem relationship wording should be consistent sitewide (Phase 5 targeted fix).
- Redundant rewrites in vercel.json (cleanUrls already serves extensionless URLs). Harmless; not worth churn.

## Working correctly (verified)

- Build pipeline (decoder bundles, browser controllers, injection) — green.
- All 264 automated tests pass at baseline.
- robots.txt correctly blocks utility/template routes (`/diagnostic`, `/analytics-report`, `/brand-page-template`, `/serial-guide-refactor`, `/universal-decoder`, `/api/`).
- Host canonicalization: apex → www 308 via vercel.json.
- No duplicate titles or meta descriptions among indexable pages.
- Sitemap contains all 64 indexable pages (after removing the 5 redirecting entries).
- Security headers + CSP present sitewide.

## Out of scope (per project brief)

- Activating ads; paid products; accounts.
- Rewriting Smart Lookup architecture (extensive test coverage exists; only failure-path gaps addressed).
- Redesign or visual identity changes.
- New programmatic pages.
