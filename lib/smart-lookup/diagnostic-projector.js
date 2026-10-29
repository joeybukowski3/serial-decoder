import { redactDiagnosticSecrets } from './diagnostic-privacy.js';

const MAX_DEPTH = 6;
const MAX_ARRAY = 24;
const MAX_KEYS = 24;
const MAX_STRING = 4000;
const MAX_NODES = 128;

export function projectDiagnostic(value) {
  let nodes = 0;
  const seen = new WeakSet();
  function visit(input, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return '[TRUNCATED]';
    if (typeof input === 'string') return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)} [TRUNCATED]` : input;
    if (input == null || typeof input === 'number' || typeof input === 'boolean') return input;
    if (typeof input !== 'object') return String(input).slice(0, MAX_STRING);
    if (seen.has(input)) return '[CIRCULAR]';
    seen.add(input);
    if (Array.isArray(input)) {
      const result = input.slice(0, MAX_ARRAY).map((item) => visit(item, depth + 1));
      if (input.length > MAX_ARRAY) result.push(`[TRUNCATED ${input.length - MAX_ARRAY} ITEMS]`);
      return result;
    }
    const result = Object.create(null);
    let count = 0;
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      if (count++ >= MAX_KEYS) { result.__truncatedKeys = true; break; }
      if (typeof input[key] !== 'function') result[key.slice(0, 120)] = visit(input[key], depth + 1);
    }
    return result;
  }
  return visit(value, 0);
}

export function diagnosticJson(value, max, env = process.env) {
  try {
    const text = redactDiagnosticSecrets(JSON.stringify(projectDiagnostic(value)), env);
    return text.length > max ? `${text.slice(0, max)} [TRUNCATED]` : text;
  } catch (_) { return '[UNSERIALIZABLE]'; }
}
