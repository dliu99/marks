// React Native's AbortSignal does not consistently implement the static timeout API.
export async function fetchWithTimeout(
  network: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await network(input, { ...init, signal: controller.signal as RequestInit['signal'] });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
