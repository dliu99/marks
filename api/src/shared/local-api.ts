import { Hono } from 'hono';
import type { Variables } from '../types';
import { createICRoutes } from './ic-routes';
import type { SessionRepository } from './campus-session';

export function createLocalAPI(repository: SessionRepository, request: typeof fetch) {
  // This router runs in-process. Its URL is only a routing key; no Marks server is contacted.
  return new Hono<{ Variables: Variables }>()
    .use('*', async (c, next) => {
      const session = repository.get();
      if (!session) return c.json({ message: 'Please sign in again.' }, 401);
      c.set('session', session);
      await next();
    })
    .route('/ic', createICRoutes(request))
    .onError((error, c) =>
      c.json(
        { message: error.message },
        ('status' in error && typeof error.status === 'number' && error.status >= 400
          ? error.status
          : 503) as 401 | 503
      )
    );
}
