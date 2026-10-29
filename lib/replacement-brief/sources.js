/**
 * Source references for the brief. Every entry is an evidence record that the research really attached to a returned
 * grounding result; a claim whose source domain did not resolve has no URL and is never listed. `pageChecked` is always
 * false: a source here means "the search returned this domain for the claim", not "the page text was read and matched".
 */

const GROUNDING_REDIRECT_HOST = 'vertexaisearch.cloud.google.com';
const MAX_SOURCES = 8;
const MAX_SUPPORTS = 4;
const MAX_TITLE = 80;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

function parseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return { url: `${url.origin}${url.pathname}`, host: url.hostname.toLowerCase() };
  } catch { return null; }
}

/** @param {{evidence: object[], referencedIds: Set<string>}} input */
export function buildSources({ evidence, referencedIds }) {
  const byUrl = new Map();
  for (const record of evidence) {
    if (!referencedIds.has(record.evidenceId)) continue;
    const parsed = parseUrl(record.url);
    if (!parsed) continue;
    const entry = byUrl.get(parsed.url) || {
      domain: record.domain || parsed.host.replace(/^www\./, ''),
      title: String(record.sourceName || record.domain || parsed.host).replace(CONTROL, ' ').trim().slice(0, MAX_TITLE),
      url: parsed.url,
      viaSearchRedirect: parsed.host === GROUNDING_REDIRECT_HOST,
      pageChecked: false,
      supports: [],
    };
    const model = record.claim?.subjectModel;
    if (model && !entry.supports.includes(model) && entry.supports.length < MAX_SUPPORTS) entry.supports.push(model);
    byUrl.set(parsed.url, entry);
  }
  return [...byUrl.values()].slice(0, MAX_SOURCES);
}
