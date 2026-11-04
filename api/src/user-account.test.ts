// @ts-nocheck
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fetchUserAccount } from './user-account';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function respond(byPath: Record<string, [number, unknown?]>) {
  const calls: string[] = [];
  globalThis.fetch = mock(async (url: string) => {
    const path = new URL(url).pathname.replace('/campus', '');
    calls.push(path);
    const [status, body] = byPath[path] ?? [404];
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  });
  return calls;
}

const account = { userID: 7, personID: 42, firstName: 'Ada', lastName: 'L', username: 'ada' };

describe('fetchUserAccount', () => {
  test('uses the legacy endpoint on older IC releases', async () => {
    const calls = respond({ '/resources/my/userAccount': [200, account] });
    expect(await fetchUserAccount('x.example/campus', 'c')).toEqual({ account, status: 200 });
    expect(calls).toEqual(['/resources/my/userAccount']);
  });

  test('falls back to the current portal endpoint when the legacy one is gone', async () => {
    const calls = respond({
      '/resources/my/userAccount': [404],
      '/api/campus/userAccounts/my': [200, account],
    });
    expect((await fetchUserAccount('x.example/campus', 'c')).account).toEqual(account);
    expect(calls).toEqual(['/resources/my/userAccount', '/api/campus/userAccounts/my']);
  });

  test('reports an expired session instead of trying other endpoints', async () => {
    const calls = respond({ '/resources/my/userAccount': [401] });
    expect(await fetchUserAccount('x.example/campus', 'c')).toEqual({ account: null, status: 401 });
    expect(calls).toHaveLength(1);
  });

  test('returns the last status when no endpoint answers', async () => {
    respond({ '/resources/my/userAccount': [404], '/api/campus/userAccounts/my': [405] });
    expect(await fetchUserAccount('x.example/campus', 'c')).toEqual({ account: null, status: 405 });
  });
});
