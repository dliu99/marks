import type { userAccount } from './types';

export type ICUserAccount = userAccount & { userID: number };

// Older IC releases serve the legacy path; newer ones (SRVUSD since
// 2026-09-30) return 404 there and serve the current portal's endpoint, which
// older releases reject with 405.
const USER_ACCOUNT_PATHS = ['/resources/my/userAccount', '/api/campus/userAccounts/my'];

/**
 * Fetch the signed-in IC user's account. Returns the last HTTP status when no
 * known endpoint answers, so callers can tell an expired cookie (401) apart.
 */
export async function fetchUserAccount(
  baseURL: string,
  cookie: string,
  headers: Record<string, string> = {}
): Promise<{ account: ICUserAccount | null; status: number }> {
  let status = 0;
  for (const path of USER_ACCOUNT_PATHS) {
    const response = await fetch(`https://${baseURL}${path}`, {
      headers: { Accept: 'application/json, text/plain, */*', ...headers, Cookie: cookie },
    });
    status = response.status;
    if (response.ok) {
      const account = (await response.json().catch(() => null)) as ICUserAccount | null;
      if (account?.personID != null) return { account, status };
    }
    // An expired session is unauthorized on every path; don't mask it.
    if (status === 401 || status === 403) break;
  }
  return { account: null, status };
}
