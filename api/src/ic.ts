import { Hono } from 'hono';
import * as Iron from 'iron-webcrypto';
import { getCookie } from 'hono/cookie';
import { env } from 'cloudflare:workers';
import type { Session, Variables } from './types';
import { WEB_SESSION_COOKIE_NAME } from './web-session';
import { createICRoutes } from './shared/ic-routes';

function getIronKey(): string {
  return (env as Env).IRON_KEY;
}

const ic = new Hono<{ Variables: Variables }>()
  .use(async (c, next) => {
    const sessionToken = c.req.header('Authorization') || getCookie(c, WEB_SESSION_COOKIE_NAME);
    if (!sessionToken) {
      return c.json({ ok: false, message: 'Unauthorized, no session' }, 401);
    }
    try {
      const session = await Iron.unseal(sessionToken, getIronKey(), Iron.defaults);
      c.set('session', session as Session);
    } catch {
      return c.json({ ok: false, message: 'Invalid session token' }, 401);
    }
    await next();
  })
  .route('/', createICRoutes());

export default ic;
