// @ts-nocheck
import { expect, test } from 'bun:test';
import { fetchWithTimeout } from '../api/src/shared/fetch-timeout';

test('the deadline includes downloading the response body after headers arrive', async () => {
  let requestSignal: AbortSignal | undefined;
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const result = fetchWithTimeout(
    async (_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Response(
        new ReadableStream({
          start(controller) {
            bodyController = controller;
            controller.enqueue(new TextEncoder().encode('{"incomplete":'));
          },
        })
      );
    },
    'https://district.example/campus/resources/portal/grades',
    {},
    5
  );
  await expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(requestSignal?.aborted).toBe(true);
  bodyController.error(new Error('Clean up synthetic download'));
});

test('the deadline still rejects when a native request ignores cancellation', async () => {
  await expect(
    fetchWithTimeout(
      async () => new Promise<Response>(() => {}),
      'https://district.example/campus/test',
      {},
      5
    )
  ).rejects.toMatchObject({ name: 'TimeoutError' });
});

test('caller cancellation also interrupts a pending body read', async () => {
  const caller = new AbortController();
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const result = fetchWithTimeout(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            bodyController = controller;
            caller.abort();
          },
        })
      ),
    'https://district.example/campus/test',
    { signal: caller.signal }
  );
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  bodyController.close();
});

test('successful downloads preserve JSON, status, and rotating cookie headers', async () => {
  const response = await fetchWithTimeout(
    async () =>
      Response.json(
        { ok: true },
        { status: 201, headers: { 'set-cookie': 'session=new; HttpOnly' } }
      ),
    'https://district.example/campus/test'
  );
  expect(response.status).toBe(201);
  expect(response.headers.get('set-cookie')).toBe('session=new; HttpOnly');
  expect(await response.json()).toEqual({ ok: true });
});

test('buffered responses keep non-ASCII text under React Native', async () => {
  // Mirrors whatwg-fetch 3.6 (React Native's global Response): string bodies are
  // kept as text, but ArrayBuffer bodies are decoded one byte per character.
  class ReactNativeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? '';
      this.headers = new Headers(init.headers);
    }
    async text() {
      if (this.body instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(this.body), (byte) => String.fromCharCode(byte)).join('');
      }
      return this.body ?? '';
    }
    async json() {
      return JSON.parse(await this.text());
    }
  }
  const NativeResponse = globalThis.Response;
  const school = { teacher: 'José Núñez', task: '“Unit 3” review 📘' };
  const network = async () => NativeResponse.json(school);
  globalThis.Response = ReactNativeResponse;
  try {
    const response = await fetchWithTimeout(network, 'https://district.example/campus/test');
    expect(await response.json()).toEqual(school);
  } finally {
    globalThis.Response = NativeResponse;
  }
});

test('empty successful responses remain valid', async () => {
  const response = await fetchWithTimeout(
    async () => new Response(null, { status: 204 }),
    'https://district.example/campus/test'
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
});
