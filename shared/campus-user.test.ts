// @ts-nocheck
import { expect, test } from 'bun:test';
import { getCampusUser } from '../api/src/shared/campus-user';
import { fetchWithTimeout } from '../api/src/shared/fetch-timeout';

const user = {
  userID: 1,
  personID: 2,
  firstName: 'Student',
  lastName: 'Example',
  username: 'student',
  homepage: '',
};
test('older districts keep their existing account endpoint', async () => {
  const paths = [];
  const actual = await getCampusUser('district.example/campus', async (url) => {
    paths.push(new URL(url).pathname);
    return Response.json(user);
  });
  expect(actual).toEqual(user);
  expect(paths).toEqual(['/campus/resources/my/userAccount']);
});

test('current districts fall back to the identity endpoint used by the official portal', async () => {
  const actual = await getCampusUser('district.example/campus', async (url) => {
    const target = new URL(url);
    if (target.pathname.includes('/resources/') || target.pathname.includes('/api/'))
      return new Response(null, { status: 404 });
    expect(target.pathname).toBe('/campus/prism');
    expect(target.searchParams.get('x')).toBe('user.UserAccount-loadFromUser');
    return Response.json({
      data: {
        Header: {
          User: {
            ...user,
            userID: '1',
            personID: '2',
            email: 'private@example.test',
            sessionID: 'private',
          },
        },
        UserAccount: { homepage: 'home' },
      },
    });
  });
  expect(actual).toEqual({ ...user, homepage: 'home' });
  expect(actual).not.toHaveProperty('email');
  expect(actual).not.toHaveProperty('sessionID');
});

test('permission failures do not silently use a different endpoint', async () => {
  let calls = 0;
  await expect(
    getCampusUser('district.example/campus', async () => {
      calls++;
      return new Response(null, { status: 403 });
    })
  ).rejects.toMatchObject({ status: 403 });
  expect(calls).toBe(1);
});

test('missing identity and HTML login pages require signing in again', async () => {
  for (const response of [Response.json({}), new Response('<html>Login</html>')]) {
    await expect(
      getCampusUser('district.example/campus', async () => response)
    ).rejects.toMatchObject({ status: 401 });
  }
});

test('the timeout works without AbortSignal.timeout support', async () => {
  const network = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('Timed out')));
    });
  await expect(
    fetchWithTimeout(network, 'https://district.example/campus/test', {}, 5)
  ).rejects.toThrow('Timed out');
});

test('the timeout forwards caller cancellation', async () => {
  const caller = new AbortController();
  const result = fetchWithTimeout(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('Cancelled')));
        caller.abort();
      }),
    'https://district.example/campus/test',
    { signal: caller.signal }
  );
  await expect(result).rejects.toThrow('Cancelled');
});

test('supports the current userAccounts endpoint without needing Prism', async () => {
  const paths = [];
  const actual = await getCampusUser('district.example/campus', async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return path.includes('/resources/') ? new Response(null, { status: 404 }) : Response.json(user);
  });
  expect(actual).toEqual(user);
  expect(paths).toEqual(['/campus/resources/my/userAccount', '/campus/api/campus/userAccounts/my']);
});
