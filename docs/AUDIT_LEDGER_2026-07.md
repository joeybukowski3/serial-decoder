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

## Resolutions (this branch)

| Ledger item | Status | Commit |
|---|---|---|
| C1 broken `/where-is-my-serial-number` links (19) | Fixed → `/serial-number-location-guide` + 308 redirect added | `ef89ed7` |
| C2 redirecting sitemap entries (5) | Removed; sitemap = exactly 64 indexable pages | `ef89ed7` |
| C3/C4/C5 redirect-chain + .html links (75 on live pages) | All rewritten to final clean URLs | `ef89ed7` |
| C6/C7 missing canonicals (7) + descriptions (6) | Added | `225a1d1` |
| C8 hidden duplicate H1 on 4 utility pages | Header wordmark demoted; topical H1 promoted | `225a1d1` |
| C9 orphan Whirlpool sub-pages (2) | Linked from parent brand page | `ef89ed7` |
| C10 no redirect for crawled 404 | vercel.json redirect added | `ef89ed7` |
| V1 decoder systemic defects | 5 confirmed defect classes fixed w/ 6 regression tests (week 54–99, month 13–99, future years, fabricated months, future-candidate display) | `735ea74` |
| V2 analytics gaps | decode_start/success/fail wired to GA4, raw inputs stripped, prod-host gated | `c36d76a` |
| V3 AdSense/no units | Confirmed: loader on 65 pages, 0 ins units, ads.txt valid. Left as-is (possible account-side Auto Ads); documented in ad-readiness report | n/a |
| Item Assist ↔ DecodeMyItem | Relationship stated on About + Methodology; competitor citations removed from trust copy | `0e80aef` |
| Smart Lookup Gemini output uncapped | maxOutputTokens 2048 + regression test | `1583f16` |

## Do-not-fix (deliberate)

- Category pages (`/appliances`, `/hvac`, `/electronics`, `/water-heaters`) stay `noindex, follow` — indexing them is a content-strategy decision, not a repair.
- Redundant vercel.json rewrites duplicating cleanUrls behavior — harmless; removing risks routing regressions for zero user benefit.
- Retired `.html` brand files (whirlpool.html, ge.html, …) still in repo with stale internal links — unreachable in production (redirects win over cleanUrls); deleting is optional cleanup, not a defect.
- Case-echo cosmetics in decoder output (e.g. "Week zz" for lowercase junk input) — unreachable for valid serials; pipeline uppercases nothing but decoders handle valid inputs case-insensitively (verified by probe).
- Raw decoder dual-year outputs like "2010/2040" at the *data* level — by design for recycled formats; display-level collapse now handles impossible years.
- AdSense loader script present with no units — possible account-side Auto Ads; removal not confirmed necessary (brief: remove only when confirmed).
- localStorage-only analytics keeping raw Smart Lookup query in `recentEvents` — never leaves the browser; flagged for future review, not a defect.
- `fireFallbackAlert` posts brand+serial to internal `/api/alerts` — pre-existing internal alerting, serial never goes to third parties; out of scope.

## Out of scope (per project brief)

- Activating ads; paid products; accounts.
- Rewriting Smart Lookup architecture (extensive test coverage exists; only failure-path gaps addressed).
- Redesign or visual identity changes.
- New programmatic pages.
