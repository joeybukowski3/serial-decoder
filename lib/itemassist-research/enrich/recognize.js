import { detectCategory } from './category.js';

/**
 * A product the web results agree on, when the identification step did not complete. Used ONLY when the provider failed to answer (never when
 * it answered and could not place the item): a request that failed says nothing about the product, so a name the person typed that several
 * separate sites' results repeat is reported as recognised from those results, at low confidence, with no specification, price or replacement
 * attached. Nothing is invented: the name shown is the person's own wording, tidied; the results only corroborate that it is a real product name.
 */

export const MIN_AGREEING_SITES = 2;
const MIN_TOKENS = 2;
const MAX_IDENTITY_CHARS = 100;
// Words that are not part of a product's name.
const STOP = new Set(['the', 'and', 'for', 'with', 'old', 'new', 'used', 'my', 'our', 'a', 'an', 'of', 'to', 'in', 'on', 'replacement', 'replace', 'replacing', 'best', 'cheap', 'cheaper', 'price', 'prices', 'buy']);

const tokensOf = (text) => [...new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])].filter((token) => !STOP.has(token) && (token.length >= 3 || /\d/.test(token)));
// Short words that are always written in capitals.
const ACRONYMS = new Set(['tv', 'pc', 'led', 'oled', 'qled', 'lcd', 'uhd', 'hdr', 'ssd', 'usb', 'lg', 'hp', 'ge', 'ps', 'rv', 'ac']);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

/** "nintendo wii" -> "Nintendo Wii"; "ps5 slim" -> "PS5 Slim"; anything the person capitalised is kept as typed. */
export function tidyName(query) {
  return String(query || '').trim().replace(/\s+/g, ' ').split(' ').map((word) => {
    if (ACRONYMS.has(word)) return word.toUpperCase();
    if (/^[a-z]+$/.test(word)) return word[0].toUpperCase() + word.slice(1);
    if (/^[a-z0-9]+$/.test(word) && /\d/.test(word) && /[a-z]/.test(word)) return word.toUpperCase();
    return word;
  }).join(' ').slice(0, MAX_IDENTITY_CHARS);
}

/**
 * @param {string} query  the cleaned user query
 * @param {{title: string, url: string, snippet: string}[]|null} rows  normalized organic results for the query (any site, not only registered ones)
 * @returns {{identity: string, category: string, profile: string}|null}
 */
export function recognizeFromSources(query, rows) {
  const tokens = tokensOf(query);
  if (tokens.length < MIN_TOKENS || !Array.isArray(rows)) return null;
  const sites = new Set();
  for (const row of rows) {
    const text = `${row?.title || ''} ${row?.snippet || ''}`.toLowerCase();
    const host = hostOf(row?.url);
    if (host && tokens.every((token) => new RegExp(`\\b${token}\\b`).test(text))) sites.add(host);
  }
  if (sites.size < MIN_AGREEING_SITES) return null;
  return { identity: tidyName(query), ...(detectCategory(query) || { category: 'unknown', profile: 'unknown' }) };
}
