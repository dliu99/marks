import { Hono } from 'hono';
import { campusSessionSchema } from './campus-session';

// Keep this only for the transition from encrypted server tokens to device sessions.
export function createSessionMigrationRoutes(unseal: (token: string) => Promise<unknown>) {
  return new Hono().post('/migrate-session', async (c) => {
    c.header('Cache-Control', 'no-store');
    const token = c.req.header('Authorization');
    if (!token) return c.json({ message: 'Missing session token' }, 401);
    try {
      const session = campusSessionSchema.parse(await unseal(token));
      return c.json({ session });
    } catch {
      return c.json({ message: 'Invalid session token' }, 401);
    }
  });
}
