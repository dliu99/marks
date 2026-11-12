import {
  CampusError,
  createCampusTransport,
  type CampusSession,
  type SessionRepository,
} from '../api/src/shared/campus-session';
import { renewCampusSession } from './campus-auth';

export type CampusAuthStatus = 'authenticated' | 'expired';

// A 403 this soon after a successful renewal cannot be an expired session.
const FRESH_SESSION_MS = 60_000;

export function createCampusClient(
  repository: SessionRepository,
  network: typeof fetch,
  onAuthStatus: (status: CampusAuthStatus) => void = () => {}
) {
  let revision = 0;
  let renewal: Promise<void> | null = null;
  let pendingRenewal: Promise<void> | null = null;
  let renewalGeneration: number | undefined;
  let renewalSession: CampusSession | null = null;
  let renewedAt = 0;
  // Paths still answering 403 right after a successful renewal (keyed by account
  // generation): real permission errors, so they never trigger another renewal.
  const forbiddenPaths = new Set<string>();

  const sameAccount = (session: CampusSession | null, generation: number | undefined) => {
    const current = repository.get();
    return (
      !!session &&
      !!current &&
      repository.generation?.() === generation &&
      current.baseURL === session.baseURL &&
      current.deviceId === session.deviceId &&
      current.userID === session.userID &&
      current.personID === session.personID
    );
  };
  const assertAccount = (session: CampusSession | null, generation: number | undefined) => {
    if (!sameAccount(session, generation)) {
      throw new CampusError('Your account changed. Please try again.', 409);
    }
  };

  // Ignore cookie updates from requests sent before the latest renewal. An old
  // response must not delete or overwrite the newly bootstrapped credentials.
  const transport = (requestRevision: number) =>
    createCampusTransport(
      {
        get: () => repository.get(),
        generation: repository.generation ? () => repository.generation!() : undefined,
        save: (session) => {
          if (requestRevision === revision) repository.save(session);
        },
      },
      network
    );

  const renew = (): Promise<void> => {
    const session = repository.get();
    const generation = repository.generation?.();
    if (!session) return Promise.reject(new CampusError('Please sign in again.', 401));
    if (pendingRenewal && sameAccount(renewalSession, renewalGeneration)) return pendingRenewal;

    renewalGeneration = generation;
    renewalSession = session;
    const renewalTransport = transport(++revision);
    const request: typeof fetch = (input, init) => {
      assertAccount(session, generation);
      return renewalTransport(input, init);
    };
    const operation = Promise.resolve()
      .then(() => {
        assertAccount(session, generation);
        return renewCampusSession(session, request);
      })
      .then(() => {
        assertAccount(session, generation);
        renewedAt = Date.now();
        onAuthStatus('authenticated');
      })
      .catch((error: unknown) => {
        assertAccount(session, generation);
        if (error instanceof CampusError && error.status === 401) onAuthStatus('expired');
        throw error;
      })
      .finally(() => {
        if (pendingRenewal === operation) pendingRenewal = null;
      });
    renewal = pendingRenewal = operation;
    return operation;
  };

  const request: typeof fetch = async (input, init) => {
    const session = repository.get();
    const generation = repository.generation?.();
    // Requests starting during renewal wait rather than sending expired cookies.
    // They do not inherit its failure: if the current cookies still work, the
    // request succeeds; if they are expired, the 401 path below renews again.
    if (pendingRenewal && sameAccount(renewalSession, renewalGeneration)) {
      await pendingRenewal.catch(() => {});
    }
    if (session) assertAccount(session, generation);
    const requestRevision = revision;
    const forbiddenKey = `${generation}:${new URL(String(input)).pathname}`;
    try {
      const response = await transport(requestRevision)(input, init);
      // IC's /api/ endpoints answer an expired session with 403, not 401. Renew and
      // retry once unless the session was just renewed or this path stayed forbidden
      // after a renewal: then it is a real permission error.
      if (response.status !== 403 || !session || forbiddenPaths.has(forbiddenKey)) {
        return response;
      }
      if (requestRevision === revision && Date.now() - renewedAt < FRESH_SESSION_MS) {
        return response;
      }
    } catch (error) {
      if (!(error instanceof CampusError) || error.status !== 401 || !session) throw error;
    }
    assertAccount(session, generation);
    // A late 401/403 from before renewal shares its result, even if it has already
    // finished. Each original request is retried at most once.
    if (requestRevision === revision) await renew();
    else await renewal;
    assertAccount(session, generation);
    try {
      const retried = await transport(revision)(input, init);
      if (retried.status === 403) forbiddenPaths.add(forbiddenKey);
      return retried;
    } catch (retryError) {
      assertAccount(session, generation);
      if (retryError instanceof CampusError && retryError.status === 401) {
        onAuthStatus('expired');
      }
      throw retryError;
    }
  };

  return { request, renew };
}
