/**
 * Small in-memory Redis with the commands the quota/usage/cooldown/cache code
 * uses: strings (get/set with NX/EX), hashes (hincrby/hget/hgetall), expire,
 * del, pipelines, and a permissive `eval` for the daily provider budget script.
 * TTLs are recorded, not enforced; tests that need "tomorrow" pass a different
 * injected clock so the code addresses different keys.
 */
export function createFakeRedis() {
  const strings = new Map();
  const hashes = new Map();
  const ttls = new Map();
  const log = [];

  const hash = (key) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key);
  };

  const commands = {
    async get(key) { return strings.has(key) ? strings.get(key) : null; },
    async set(key, value, options = {}) {
      if (options.nx && strings.has(key)) return null;
      strings.set(key, value);
      if (options.ex) ttls.set(key, options.ex);
      return 'OK';
    },
    async del(key) { const had = strings.delete(key) || hashes.delete(key); return had ? 1 : 0; },
    async hincrby(key, field, amount) {
      const map = hash(key);
      const next = Number(map.get(field) || 0) + amount;
      map.set(field, next);
      return next;
    },
    async hdel(key, field) { return hashes.has(key) && hashes.get(key).delete(field) ? 1 : 0; },
    async hget(key, field) { return hashes.has(key) && hashes.get(key).has(field) ? hashes.get(key).get(field) : null; },
    async hgetall(key) { return hashes.has(key) ? Object.fromEntries(hashes.get(key)) : null; },
    async expire(key, seconds) { ttls.set(key, seconds); return 1; },
    async incrby(_key, amount) { return amount; },
    async eval() { return [1, 1, 1]; }, // provider budget: always allowed
  };

  const redis = {
    strings,
    hashes,
    ttls,
    log,
    hash: (key) => (hashes.has(key) ? Object.fromEntries(hashes.get(key)) : {}),
    pipeline() {
      const ops = [];
      const chain = new Proxy({}, {
        get(_target, name) {
          if (name === 'exec') return async () => { const results = []; for (const [op, args] of ops) results.push(await commands[op](...args)); return results; };
          return (...args) => { ops.push([name, args]); return chain; };
        },
      });
      return chain;
    },
  };
  for (const [name, fn] of Object.entries(commands)) {
    redis[name] = async (...args) => { log.push([name, ...args]); return fn(...args); };
  }
  return redis;
}
