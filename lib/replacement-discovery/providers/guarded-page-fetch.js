import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate, inflateSync } from 'node:zlib';

export const SOFT_EXTRACTION_BYTES = 1_500_000;
export const HARD_SAFETY_BYTES = 4_000_000;
const MAX_REDIRECTS = 2;
const TIMEOUT_MS = 6000;

/** Bounded text extraction for simple manufacturer PDF text streams; unsupported font maps yield no facts. */
export function pdfVisibleText(buffer) {
  const body = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  if (!body.startsWith('%PDF-')) return '';
  const pieces = [];
  for (const match of body.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gi)) {
    let stream = Buffer.from(match[2], 'latin1');
    if (/\/FlateDecode\b/.test(match[1])) {
      try { stream = inflateSync(stream, { maxOutputLength: HARD_SAFETY_BYTES }); } catch { continue; }
    }
    const content = stream.toString('latin1');
    for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
      for (const token of block[1].matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(.*?)\]\s*TJ/g)) {
        const segment = token[1] || token[0];
        const words = [...segment.matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((item) => item[1]
          .replace(/\\([()\\])/g, '$1').replace(/\\[nr]/g, ' '));
        if (words.length) pieces.push(words.join(''));
      }
    }
  }
  return pieces.join('\n');
}

export function isPublicAddress(address) {
  const ip = isIP(address);
  if (ip === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  if (ip === 6) return !(/^(::|::1$|fc|fd|fe[89ab]|ff|2001:db8:)/i.test(address) || address.includes('%') || address.startsWith('::ffff:'));
  return false;
}

export function checkedUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')
    || isIP(url.hostname) || /(^|\.)(localhost|local|internal)$/.test(url.hostname)) throw new Error('UNSAFE_SOURCE_URL');
  return url;
}

export function createPublicLookup(resolve = lookup) {
  return async (hostname, options, callback) => {
    try {
      const result = await resolve(hostname, { all: true, verbatim: true });
      const addresses = Array.isArray(result) ? result : [result];
      if (!addresses.length || addresses.some((entry) => !entry || typeof entry.address !== 'string'
        || isIP(entry.address) !== entry.family || !isPublicAddress(entry.address))) throw new Error('PRIVATE_SOURCE_ADDRESS');
      if (options.all) callback(null, addresses);
      else {
        const chosen = options.family ? addresses.find(({ family }) => family === options.family) : addresses[0];
        if (!chosen) throw new Error('PRIVATE_SOURCE_ADDRESS');
        callback(null, chosen.address, chosen.family);
      }
    } catch { callback(new Error('SOURCE_DNS_VALIDATION_FAILED')); }
  };
}

export async function consumePageResponse(res, { timeoutMs = TIMEOUT_MS } = {}) {
  const contentType = String(res.headers['content-type'] || '').toLowerCase();
  const pdf = /^application\/pdf(;|$)/.test(contentType);
  if (!pdf && !/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/.test(contentType)) {
    res.destroy(); throw new Error('SOURCE_CONTENT_TYPE_UNSUPPORTED');
  }
  const declaredContentLength = /^\d+$/.test(String(res.headers['content-length'] || ''))
    ? Number(res.headers['content-length']) : null;
  if (declaredContentLength > HARD_SAFETY_BYTES) {
    res.destroy(); throw new Error('SOURCE_TOO_LARGE');
  }
  const encoding = String(res.headers['content-encoding'] || 'identity').toLowerCase();
  const decompress = { gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress }[encoding];
  if (encoding !== 'identity' && !decompress) {
    res.destroy(); throw new Error('SOURCE_ENCODING_UNSUPPORTED');
  }
  let responseBytes = 0; let bytesRead = 0; let storedBytes = 0; const chunks = [];
  const countWire = new Transform({ transform(chunk, unused, callback) {
    responseBytes += chunk.length;
    callback(responseBytes > HARD_SAFETY_BYTES ? new Error('SOURCE_TOO_LARGE') : null, chunk);
  } });
  const collect = new Writable({ write(chunk, unused, callback) {
    bytesRead += chunk.length;
    if (bytesRead > HARD_SAFETY_BYTES) { callback(new Error('SOURCE_TOO_LARGE')); return; }
    const remaining = SOFT_EXTRACTION_BYTES - storedBytes;
    if (remaining > 0) {
      const part = chunk.subarray(0, remaining);
      chunks.push(part); storedBytes += part.length;
    }
    callback();
  } });
  const timer = setTimeout(() => res.destroy(new Error('SOURCE_TIMEOUT')), timeoutMs);
  try {
    await pipeline(res, countWire, ...(decompress ? [decompress()] : []), collect);
    let text;
    try { text = pdf ? pdfVisibleText(Buffer.concat(chunks))
      : new TextDecoder(/charset=([^;]+)/.exec(contentType)?.[1] || 'utf-8', { fatal: storedBytes === bytesRead }).decode(Buffer.concat(chunks)); }
    catch { throw new Error('SOURCE_ENCODING_INVALID'); }
    return { contentType, declaredContentLength, responseBytes, bytesRead,
      hardLimitBytes: HARD_SAFETY_BYTES, truncated: bytesRead > SOFT_EXTRACTION_BYTES, text, usableText: Boolean(text.trim()) };
  } catch (error) {
    if (['SOURCE_TOO_LARGE', 'SOURCE_TIMEOUT', 'SOURCE_ENCODING_INVALID'].includes(error.message)) throw error;
    throw new Error('SOURCE_BODY_INVALID');
  } finally { clearTimeout(timer); }
}

function requestPage(url, publicLookup = createPublicLookup()) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = https.get(url, { timeout: TIMEOUT_MS, lookup: publicLookup,
      headers: { 'User-Agent': 'DecodeMyItem-ResearchPOC/1.0', Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf', 'Accept-Encoding': 'identity' } }, (res) => {
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.destroy();
        resolve({ status: res.statusCode, location: res.headers.location, elapsedMs: Date.now() - started, contentType });
        return;
      }
      if (res.statusCode !== 200) {
        res.destroy(); resolve({ status: res.statusCode, elapsedMs: Date.now() - started, contentType, text: '' }); return;
      }
      consumePageResponse(res).then((body) => resolve({ status: res.statusCode, elapsedMs: Date.now() - started, ...body }), reject);
    });
    req.on('timeout', () => req.destroy(new Error('SOURCE_TIMEOUT')));
    req.on('error', reject);
  });
}

/** DNS is pinned through the request lookup callback, including every redirect. */
export async function fetchSource(rawUrl, { requestImpl = requestPage } = {}) {
  let url = checkedUrl(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const result = await requestImpl(url);
    if (!result.location) return { ...result, url: url.href, redirectCount: redirects };
    if (redirects === MAX_REDIRECTS) throw new Error('SOURCE_REDIRECT_LIMIT');
    const next = checkedUrl(new URL(result.location, url).href);
    if (next.hostname !== url.hostname) throw new Error('SOURCE_CROSS_DOMAIN_REDIRECT');
    url = next;
  }
  throw new Error('SOURCE_REDIRECT_LIMIT');
}
