// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { getSchoolErrorCopy, pickSchoolError } from './school-error';

const withStatus = (status: number) => Object.assign(new Error('failed'), { status });

describe('getSchoolErrorCopy', () => {
  test('an expired login asks the student to sign in', () => {
    const copy = getSchoolErrorCopy(withStatus(401), 'grades');
    expect(copy.needsSignIn).toBe(true);
    expect(copy.title).toBe('Sign in to Infinite Campus again');
    expect(copy.message).toContain('current grades');
    expect(copy.code).toBe('Error 401');
  });

  test('network failures and timeouts read as unreachable', () => {
    for (const status of [0, 408, 502, 503, 504]) {
      const copy = getSchoolErrorCopy(withStatus(status), 'assignments');
      expect(copy.title).toBe("Can't reach Infinite Campus");
      expect(copy.needsSignIn).toBe(false);
    }
  });

  test('other statuses get their own wording', () => {
    expect(getSchoolErrorCopy(withStatus(403), 'grades').title).toBe(
      'Infinite Campus blocked this'
    );
    expect(getSchoolErrorCopy(withStatus(409), 'grades').title).toBe('Your account changed');
    expect(getSchoolErrorCopy(withStatus(500), 'grades').title).toBe(
      'Infinite Campus had a problem'
    );
    expect(getSchoolErrorCopy(withStatus(404), 'terms').title).toBe("Couldn't load your terms");
    expect(getSchoolErrorCopy(new Error('no status'), 'terms').code).toBe('Error');
  });
});

describe('pickSchoolError', () => {
  test('prefers an expired login, otherwise the first error', () => {
    const unreachable = withStatus(503);
    const expired = withStatus(401);
    expect(pickSchoolError(null, unreachable, expired)).toBe(expired);
    expect(pickSchoolError(undefined, unreachable)).toBe(unreachable);
    expect(pickSchoolError(null, undefined)).toBeNull();
  });
});
