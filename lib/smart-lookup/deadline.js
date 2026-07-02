export class SmartLookupTimeoutError extends Error {
  constructor(stage, budgetMs) {
    super(`Smart Lookup stage timed out: ${stage}`);
    this.name = 'SmartLookupTimeoutError';
    this.code = 'STAGE_TIMEOUT';
    this.stage = stage;
    this.budgetMs = budgetMs;
  }
}

export function createDeadline(options = {}) {
  const now = options.now || Date.now;
  const totalMs = Math.max(1, Number(options.totalMs || 8500));
  const startedAt = now();

  function elapsedMs() {
    return Math.max(0, now() - startedAt);
  }

  function remainingMs(reserveMs = 0) {
    return Math.max(0, totalMs - elapsedMs() - Math.max(0, reserveMs));
  }

  function hasTime(minimumMs = 1, reserveMs = 0) {
    return remainingMs(reserveMs) >= minimumMs;
  }

  async function run(stage, operation, optionsForStage = {}) {
    const reserveMs = Math.max(0, Number(optionsForStage.reserveMs || 0));
    const requestedMs = Number(optionsForStage.maxMs || remainingMs(reserveMs));
    const budgetMs = Math.max(0, Math.min(requestedMs, remainingMs(reserveMs)));
    if (budgetMs <= 0) throw new SmartLookupTimeoutError(stage, 0);

    const controller = new AbortController();
    let timeoutId;
    const operationPromise = Promise.resolve().then(() => operation({
      signal: controller.signal,
      budgetMs,
      remainingMs: () => remainingMs(reserveMs),
    }));
    operationPromise.catch(() => {});

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new SmartLookupTimeoutError(stage, budgetMs));
      }, budgetMs);
    });

    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    startedAt,
    totalMs,
    elapsedMs,
    remainingMs,
    hasTime,
    run,
  };
}

export function isTimeoutError(error) {
  return Boolean(error && (error.code === 'STAGE_TIMEOUT' || error.name === 'AbortError'));
}
