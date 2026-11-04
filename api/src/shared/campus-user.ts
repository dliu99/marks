import { z } from 'zod';
import { CampusError } from './campus-session';
import type { userAccount } from '../types';

export type CampusUser = userAccount & { userID: number };

function parseUser(value: Record<string, unknown>, homepage?: unknown): CampusUser {
  const userID = Number(value.userID);
  const personID = Number(value.personID);
  if (
    !Number.isSafeInteger(userID) ||
    userID <= 0 ||
    !Number.isSafeInteger(personID) ||
    personID <= 0
  ) {
    throw new CampusError('Please sign in to your school again.', 401);
  }
  return {
    userID,
    personID,
    username: typeof value.username === 'string' ? value.username : '',
    firstName: typeof value.firstName === 'string' ? value.firstName : '',
    lastName: typeof value.lastName === 'string' ? value.lastName : '',
    homepage: typeof homepage === 'string' ? homepage : '',
  };
}

export async function getCampusUser(baseURL: string, request: typeof fetch): Promise<CampusUser> {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  let response = await request(`https://${baseURL}/resources/my/userAccount`, { headers });
  // Support both published account paths, with the portal's Prism header as a
  // final fallback for districts that no longer serve either account endpoint.
  if (response.status === 404 || response.status === 405) {
    response = await request(`https://${baseURL}/api/campus/userAccounts/my`, { headers });
  }
  const usePrism = response.status === 404 || response.status === 405;
  if (usePrism) {
    response = await request(
      `https://${baseURL}/prism?x=user.UserAccount-loadFromUser&header=true`,
      { headers }
    );
  }
  if (!response.ok) {
    throw new CampusError(
      'Unable to verify your school session.',
      response.status >= 300 && response.status < 400 ? 401 : response.status
    );
  }
  const raw: unknown = await response.json().catch(() => null);
  const envelope = z
    .object({
      data: z.object({
        Header: z.object({ User: z.record(z.string(), z.unknown()) }),
        UserAccount: z.object({ homepage: z.unknown().optional() }).optional(),
      }),
    })
    .safeParse(raw);
  if (usePrism) {
    if (!envelope.success) throw new CampusError('Please sign in to your school again.', 401);
    return parseUser(envelope.data.data.Header.User, envelope.data.data.UserAccount?.homepage);
  }
  const account = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!account.success) throw new CampusError('Please sign in to your school again.', 401);
  return parseUser(account.data, account.data.homepage);
}
