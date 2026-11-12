// React Native's AbortSignal does not consistently implement the static timeout API.
export async function fetchWithTimeout(
  network: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000
): Promise<Response> {
  const controller = new AbortController();
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });
  const stop = (message: string, name: string) => {
    const error = new Error(message);
    error.name = name;
    // Some native body readers never settle after an abort. Reject the entire
    // operation as well as canceling the underlying download.
    rejectInterrupted(error);
    controller.abort();
  };
  const abort = () => stop('Cancelled', 'AbortError');
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort);
  const timer = setTimeout(() => stop('Timed out', 'TimeoutError'), timeoutMs);
  try {
    if (controller.signal.aborted) return await interrupted;
    return await Promise.race([
      (async () => {
        const response = await network(input, {
          ...init,
          signal: controller.signal as RequestInit['signal'],
        });
        // School requests consume small JSON/HTML responses, not live streams.
        // Buffer them inside the deadline so response.json() cannot hang later.
        // Buffer text, not bytes: React Native's Response polyfill decodes an
        // ArrayBuffer body one byte per character, garbling accented names.
        const body = await response.text();
        return new Response(
          init.method === 'HEAD' || [204, 205, 304].includes(response.status) ? null : body,
          { status: response.status, statusText: response.statusText, headers: response.headers }
        );
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
