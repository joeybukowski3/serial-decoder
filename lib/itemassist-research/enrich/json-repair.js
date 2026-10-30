import { extractJson } from '../../smart-lookup/gemini-search-provider.js';

/**
 * Reading the identification JSON, forgivingly. The reply is asked for as one JSON object, but a model can end it early or leave a trailing
 * comma, and a reply that is nearly right should not cost the whole answer (the one Gemini call is not repeated). This only ever REMOVES
 * what cannot be read, never adds content: a truncated reply is cut back to the last complete item and its open brackets are closed, so every
 * value that survives is exactly what the model wrote. What is read is then checked field by field like any other reply (normalizeIdentification).
 */

const MAX_ATTEMPTS = 80;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const withoutTrailingCommas = (text) => text.replace(/,(\s*[}\]])/g, '$1');

/** The brackets still open at the end of `text`, the positions of commas outside strings (each with the brackets open there), and whether a string is open. */
function scan(text) {
  const stack = [], cuts = [];
  let inString = false, escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',') cuts.push({ index, open: [...stack] });
  }
  return { stack, cuts, inString };
}

const closers = (open) => [...open].reverse().map((char) => (char === '{' ? '}' : ']')).join('');
// An empty object is nothing that was read (a reply that is only an opening bracket closes to one).
const tryParse = (text) => { try { const value = JSON.parse(withoutTrailingCommas(text)); return isObject(value) && Object.keys(value).length ? value : null; } catch { return null; } };

/** The JSON object in a model reply, or null when none can be read. */
export function parseModelJson(reply) {
  const strict = extractJson(reply);
  if (isObject(strict)) return strict;
  const unfenced = String(reply || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = unfenced.indexOf('{');
  if (start < 0) return null;
  const body = unfenced.slice(start);
  const end = body.lastIndexOf('}');
  const complete = end > 0 ? tryParse(body.slice(0, end + 1)) : null;
  if (complete) return complete;
  const { stack, cuts, inString } = scan(body);
  // Cut off mid-way: close the open brackets (a value cut off inside a string is never completed), or cut back to an earlier comma and close the
  // brackets open there.
  const whole = inString ? null : tryParse(`${body}${closers(stack)}`);
  if (whole) return whole;
  for (const cut of cuts.slice(-MAX_ATTEMPTS).reverse()) {
    const value = tryParse(`${body.slice(0, cut.index)}${closers(cut.open)}`);
    if (value) return value;
  }
  return null;
}
