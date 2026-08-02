/**
 * In-process singleflight for duplicate concurrent refinement work.
 * Cache-layer and provider work for identical keys share one promise.
 *
 * Not a distributed lock — process-local only (sufficient for Vercel
 * function instances and test harnesses).
 */

const DEFAULT_STORE = new Map();

/**
 * @param {string} key
 * @param {() => Promise<any>} work
 * @param {{ store?: Map }} [options]
 */
export async function runSharedInflight(key, work, options = {}) {
  const store = options.store || DEFAULT_STORE;
  const fingerprint = String(key || '');
  if (!fingerprint) return work();

  const existing = store.get(fingerprint);
  if (existing) {
    return existing.then((value) => ({ value, shared: true }));
  }

  const promise = Promise.resolve()
    .then(work)
    .finally(() => {
      if (store.get(fingerprint) === promise) store.delete(fingerprint);
    });
  store.set(fingerprint, promise);
  const value = await promise;
  return { value, shared: false };
}

export function createInflightStore() {
  return new Map();
}

export function clearDefaultInflightStore() {
  DEFAULT_STORE.clear();
}
