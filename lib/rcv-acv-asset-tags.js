// Single source of truth for deciding which RCV/ACV linkout assets a page needs and
// for inserting them idempotently.
//
// Two separate call sites use this so their detection can never drift apart:
//   - scripts/generate-seo-pages.js  (the 26 generator-owned SEO/brand pages)
//   - scripts/inject-rcv-acv-linkout-assets.js  (the hand-maintained pages)
//
// Detection is deliberately markup-based, never filename-based: bare brand pages
// (ge.html) are hand-maintained while the same brand's *-serial-number-lookup.html is
// generated, so filenames say nothing about which panels a page actually hosts.
//
// Which asset each panel needs:
//   #serialSummaryLayer (Serial Decoder) -> rcv-acv-linkout.js builds the card, so the
//     page needs BOTH the module script and the stylesheet.
//   Smart Lookup        -> smart-lookup-controller.js already builds the card itself, so
//     the page needs ONLY the stylesheet that lays the mount out.

export const CSS_TAG = '<link rel="stylesheet" href="rcv-acv-linkout.css">';
export const JS_TAG = '<script type="module" src="/rcv-acv-linkout.js"></script>';

const HAS_DECODER = /id=["']serialSummaryLayer["']/;
const HAS_SMART_LOOKUP = /id=["']smart-lookup-input["']|src=["']\/?smart-lookup-controller\.js["']/;

const HAS_CSS_TAG = /href=["']\/?rcv-acv-linkout\.css["']/;
const HAS_JS_TAG = /src=["']\/?rcv-acv-linkout\.js["']/;

/** What a page's markup says it needs. */
export function analyze(html) {
  const decoder = HAS_DECODER.test(html);
  const smartLookup = HAS_SMART_LOOKUP.test(html);
  return {
    hasDecoderPanel: decoder,
    hasSmartLookupPanel: smartLookup,
    needsCss: decoder || smartLookup,
    needsJs: decoder,
    hasCssTag: HAS_CSS_TAG.test(html),
    hasJsTag: HAS_JS_TAG.test(html),
  };
}

/**
 * Adds whatever the markup calls for. Idempotent: a page that already carries a tag is
 * left alone, so this is safe to re-run on every build.
 */
export function ensureRcvAcvAssets(html) {
  const state = analyze(html);
  let next = html;

  if (state.needsCss && !state.hasCssTag) {
    // Sit alongside the page's other stylesheets rather than after runtime-injected CSS.
    const links = [...next.matchAll(/[ \t]*<link rel=["']stylesheet["'][^>]*>/g)];
    const last = links[links.length - 1];
    if (last) {
      const at = last.index + last[0].length;
      const indent = (last[0].match(/^[ \t]*/) || [''])[0];
      next = next.slice(0, at) + `\n${indent}${CSS_TAG}` + next.slice(at);
    } else {
      next = next.replace(/<\/head>/i, `  ${CSS_TAG}\n</head>`);
    }
  }

  if (state.needsJs && !state.hasJsTag) {
    next = next.replace(/<\/body>/i, `${JS_TAG}\n</body>`);
  }

  return next;
}

/**
 * Post-condition check. Returns a list of human-readable problems; empty means the page
 * is correctly wired. The type="module" assertion is load-bearing — rcv-acv-linkout.js
 * imports /lib/rcv-acv-linkout-helpers.js, so a plain <script defer> tag (the shape used
 * by the sibling responsive-navigation injector) would silently break the import.
 */
export function verify(html, label) {
  const state = analyze(html);
  const problems = [];

  if (state.needsCss && !state.hasCssTag) problems.push(`${label}: missing rcv-acv-linkout.css`);
  if (state.needsJs && !state.hasJsTag) problems.push(`${label}: missing rcv-acv-linkout.js`);

  if (state.hasJsTag) {
    const tag = (html.match(/<script[^>]*src=["']\/?rcv-acv-linkout\.js["'][^>]*>/) || [''])[0];
    if (!/type=["']module["']/.test(tag)) {
      problems.push(`${label}: rcv-acv-linkout.js tag is missing type="module" -> ${tag}`);
    }
  }

  return problems;
}
