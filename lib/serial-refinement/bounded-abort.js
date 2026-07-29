export function createBoundedAbort(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 1));

  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    },
  };
}
