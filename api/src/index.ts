import { CampusError } from './shared/campus-session';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import announcement from './announcement';
import auth from './auth';
import ic from './ic';
import { openApiDocument } from './openapi';

const allowedCorsOrigins = new Set(['http://localhost:3000']);
const corsAllowMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const corsAllowHeaders = 'Content-Type, Authorization';

function setCorsHeaders(headers: Headers, origin: string | undefined): boolean {
  if (!origin || !allowedCorsOrigins.has(origin)) return false;

  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');

  const vary = headers.get('Vary');
  if (!vary) {
    headers.set('Vary', 'Origin');
  } else if (!vary.split(',').some((value) => value.trim().toLowerCase() === 'origin')) {
    headers.set('Vary', `${vary}, Origin`);
  }

  return true;
}

const app = new Hono<{ Bindings: Env }>()
  .onError((error, c) => {
    if (error instanceof CampusError) {
      return c.json(
        { ok: false, message: error.message },
        (error.status >= 400 && error.status <= 599 ? error.status : 503) as ContentfulStatusCode
      );
    }
    return c.json({ ok: false, message: 'The school request could not be completed.' }, 500);
  })
  .use('*', async (c, next) => {
    const origin = c.req.header('Origin');

    if (c.req.method === 'OPTIONS') {
      const headers = new Headers();
      const allowed = setCorsHeaders(headers, origin);

      if (allowed) {
        headers.set('Access-Control-Allow-Methods', corsAllowMethods);
        headers.set('Access-Control-Allow-Headers', corsAllowHeaders);
      }

      return new Response(null, { status: 204, headers });
    }

    await next();
    setCorsHeaders(c.res.headers, origin);
  })
  .get('/openapi.json', (c) => c.json(openApiDocument))
  .get('/docs', swaggerUI({ url: '/openapi.json' }))
  .route('/announcement', announcement)
  .route('/auth', auth)
  .route('/ic', ic);
export default app;
export type AppType = typeof app;
