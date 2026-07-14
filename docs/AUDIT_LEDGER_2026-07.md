# Site Foundation Audit Ledger — July 2026

Branch: `audit/seo-decoder-site-foundation` · Starting SHA: `e0e8b34fe01d309f2f303201f5cf1c689f665a65`
Audit tool: `scripts/audit/site-audit.mjs` (models Vercel cleanUrls + vercel.json redirects/rewrites)

Baseline (before fixes): build ✅ · decoder tests 129/129 ✅ · refinement unit 35/35 ✅ · API 34/34 ✅ · smart-lookup unit 66/66 ✅

## Confirmed defects

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| C1 | HIGH | `/where-is-my-serial-number` linked from 19 indexable pages returned a live 404. Correct target `/serial-number-location-guide` existed and returned 200. | live response + audit tool broken-link scan |
| C2 | HIGH | sitemap.xml contained 5 URLs that 308-redirected. Sitemap must list final URLs only. | vercel.json redirects vs sitemap.xml |
| C3 | MED | `/brands` linked to retired brand routes that redirected to final lookup pages. | audit tool redirected-link scan |
| C4 | MED | 18 live pages linked `/appliance-age-by-serial-number`, which redirected to `/how-old-is-my-appliance`. | audit tool |
| C5 | MED | Live internal links used `.html` suffixes and created cleanUrls redirect hops. | audit tool |
| C6 | MED | Seven indexable pages were missing canonical tags. | audit tool head parse |
| C7 | MED | Six indexable pages were missing meta descriptions. | audit tool |
| C8 | MED | Four utility pages had a duplicate hidden H1 in the header wordmark. | audit tool |
| C9 | LOW | Two Whirlpool sub-pages were orphaned from live internal navigation. | audit tool |
| C10 | LOW | No compatibility redirect existed for the already-crawled `/where-is-my-serial-number` URL. | live response |

## Independent review findings

A separate read-only review was completed before deployment. It found no Blockers and confirmed the routing, sitemap, canonical, decoder-boundary, and branch-integration work. It also found the following issues in this branch before merge:

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| R1 | HIGH | The GA4 forwarding denylist excluded only `query`, `serial`, and `model`. A raw serial could still be sent under `context`; `refinedQuery` and other renamed user-input fields could also pass. | Added `analytics-privacy-guard.js`, which wraps `window.gtag` and forwards only an explicit set of coarse event parameters. The guard is loaded before decoder helper scripts. Added executable payload tests that prove raw and arbitrarily named fields are removed. |
| R2 | MED | `api/lkq-compare.js` called Gemini directly without output-token limit, request deadline, or reasonable bounds on `originalItem`, `originalSpecs`, and `specLabels`. | Added 2,048 output-token cap, 7-second abort deadline, bounded strings/collections, structured timeout/provider errors, and no raw provider errors in responses. |
| R3 | MED | The decoder invariant sweep printed more than 1,000 mixed findings but always exited successfully. | Findings are now classified as fatal or informational. Exceptions, invalid week/month forms, and undefined/NaN/null leaks produce a non-zero exit. Raw candidate-year, case, and punctuation observations remain explicitly informational. |
| R4 | MED | Existing analytics regression coverage searched source text rather than executing the forwarding behavior. | Added `tests/api/analytics-privacy.test.mjs`, which executes the guard and inspects actual forwarded `gtag` arguments. |
| R5 | MED | Shared Smart Lookup Gemini token override remains bounded only by caller discipline. | Still open: the shared provider default is 2,048, but `geminiMaxOutputTokens` should be clamped in a follow-up change. The direct LKQ comparison endpoint is now independently capped. |
| R6 | LOW | Seven changed pages retained old sitemap `lastmod` dates. | Still open as a low-priority sitemap freshness correction; sitemap validity and route inventory are unaffected. |

The privacy finding was discovered before deployment. This branch has never been deployed to production, so the branch-introduced GA4 leak did not expose production inputs.

## Improvement opportunities (not defects)

- Category pages (`/appliances`, `/hvac`, `/electronics`, `/water-heaters`) are deliberately `noindex, follow`. Flipping to index is a content-strategy call, not a repair. Left unchanged.
- Redundant rewrites in vercel.json duplicate cleanUrls behavior but are harmless.
- Item Assist ↔ DecodeMyItem relationship wording should remain consistent as pages evolve.

## Working correctly (verified)

- Build pipeline (decoder bundles, browser controllers, injection) was green before the independent correction commits.
- All original automated suites passed before the correction commits.
- robots.txt blocks utility/template routes as intended.
- Host canonicalization: apex → www 308 via vercel.json.
- No duplicate titles or meta descriptions among indexable pages.
- Sitemap contains the 64 intended final indexable routes and no redirecting entries.
- Security headers + CSP are present sitewide.
- Smart Lookup deterministic-first behavior, schema validation, escaping, cache/rate limits, and structured provider-failure paths were verified.

## Resolutions (original audit work)

| Ledger item | Status | Commit |
|---|---|---|
| C1 broken `/where-is-my-serial-number` links | Fixed → `/serial-number-location-guide` + compatibility redirect | `ef89ed7` |
| C2 redirecting sitemap entries | Removed; sitemap = 64 final indexable pages | `ef89ed7` |
| C3/C4/C5 redirect-chain + `.html` links | Rewritten to final clean URLs on live pages | `ef89ed7` |
| C6/C7 missing canonicals + descriptions | Added | `225a1d1` |
| C8 hidden duplicate H1 | Header wordmark demoted; topical H1 promoted | `225a1d1` |
| C9 orphan Whirlpool sub-pages | Linked from parent brand page | `ef89ed7` |
| C10 missing compatibility redirect | Added | `ef89ed7` |
| V1 decoder systemic defects | Five confirmed defect classes fixed with regression coverage | `735ea74` |
| V2 analytics funnel | decode_start/success/fail wired to GA4 and production-host gated; later privacy allowlist correction documented under R1 | `c36d76a` + follow-up |
| V3 AdSense/no units | Loader on 65 pages, zero placed units, ads.txt valid. Left unchanged pending account-side Auto Ads verification. | n/a |
| Item Assist ↔ DecodeMyItem | Relationship stated on About + Methodology; competitor citations removed from trust copy | `0e80aef` |
| Shared Smart Lookup Gemini default | Default `maxOutputTokens` set to 2,048; override clamping remains open under R5 | `1583f16` |

## Do-not-fix / deliberate scope decisions

- Category pages stay `noindex, follow` until an SEO content-strategy decision is made.
- Redundant vercel.json rewrites remain because removing them has little value and some routing risk.
- Retired `.html` brand files remain in the repository; their stale links are unreachable in production.
- Cosmetic case echoes in invalid decoder messages remain low priority.
- Raw decoder dual-year candidates remain in data by design; public result handling removes impossible future candidates.
- AdSense loader remains until account-side Auto Ads status is checked.
- Smart Lookup recent-query localStorage remains client-only and was not expanded in scope.
- `fireFallbackAlert` posting serials to the internal `/api/alerts` endpoint remains a separate privacy/operations review item.

## Remaining validation before merge

Run from the updated branch:

- `npm run build`
- `npm test`
- `npm run test:smart-unit`
- `npm run test:smart-api`
- `node scripts/audit/decoder-invariant-sweep.mjs`
- `node scripts/audit/site-audit.mjs`
- `git diff --check`

The branch should not be merged until the new analytics privacy test and updated API behavior pass in the repository environment.

## Out of scope

- Activating ads; paid products; accounts.
- Broad Smart Lookup architecture rewrite.
- Redesign or visual identity changes.
- New programmatic pages.
