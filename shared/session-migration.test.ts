// @ts-nocheck
import { expect, test } from 'bun:test';
import * as Iron from 'iron-webcrypto';
import { createSessionMigrationRoutes } from '../api/src/shared/session-migration';

const key = 'test-only-encryption-key-at-least-32-characters';
const session = {
  baseURL: 'district.example/campus',
  cookie: 'session=example',
  deviceId: 'phone',
  deviceModel: 'iPhone',
  deviceType: 'iOS',
  systemVersion: '26',
  userID: 1,
  personID: 2,
};
const app = createSessionMigrationRoutes((token) => Iron.unseal(token, key, Iron.defaults));

test('only a valid encrypted bearer token can export its own session, without a database', async () => {
  const token = await Iron.seal(session, key, Iron.defaults);
  const result = await app.request('/migrate-session', {
    method: 'POST',
    headers: { Authorization: token },
  });
  expect(result.status).toBe(200);
  expect(result.headers.get('Cache-Control')).toBe('no-store');
  expect(await result.json()).toEqual({ session });
});

test('missing, tampered, expired and malformed migration tokens do not reveal sessions', async () => {
  const valid = await Iron.seal(session, key, Iron.defaults);
  const expired = await Iron.seal(session, key, {
    ...Iron.defaults,
    ttl: 1,
    timestampSkewSec: 0,
    localtimeOffsetMsec: -120000,
  });
  const malformed = await Iron.seal(
    { ...session, baseURL: 'user:pass@district.example/campus' },
    key,
    Iron.defaults
  );
  for (const token of ['', `${valid}tampered`, expired, malformed]) {
    const result = await app.request('/migrate-session', {
      method: 'POST',
      headers: token ? { Authorization: token } : {},
    });
    expect(result.status).toBe(401);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(await result.json())).not.toContain('example');
  }
});
