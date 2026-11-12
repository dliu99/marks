// @ts-nocheck
import { expect, test } from 'bun:test';
import { loadAnnouncement } from './announcement';

const message = {
  id: 'hosting-update-1',
  title: 'Marks update',
  message: 'Install the latest update.',
  kind: 'info',
  dismissible: true,
  ctaUrl: 'https://marks.cx',
};

test('announcements include the app version but no school credentials', async () => {
  const result = await loadAnnouncement('https://api.example/', '1.2.1', async (input, init) => {
    expect(String(input)).toBe('https://api.example/announcement?version=1.2.1');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toBeUndefined();
    return Response.json(message);
  });
  expect(result).toEqual(message);
});

test('missing configuration skips the network', async () => {
  let called = false;
  expect(
    await loadAnnouncement(undefined, '1.2.1', async () => {
      called = true;
    })
  ).toBeNull();
  expect(called).toBe(false);
});

test('retired hosting, outages and invalid responses silently hide announcements', async () => {
  const responses = [
    () => new Response('Unavailable', { status: 503 }),
    () => new Response('Not found', { status: 404 }),
    () => new Response('<html>Hosting expired</html>'),
    () => Response.json(null),
    () => Response.json({ title: 'Incomplete' }),
    () => Response.json({ ...message, ctaUrl: 'javascript:alert(1)' }),
    () => {
      throw new TypeError('Network unavailable');
    },
  ];
  for (const response of responses) {
    expect(
      await loadAnnouncement('https://api.example', '1.2.1', async () => response())
    ).toBeNull();
  }
});

test('unmount cancellation aborts the optional request', async () => {
  const controller = new AbortController();
  const pending = loadAnnouncement(
    'https://api.example',
    '1.2.1',
    async (_input, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    },
    controller.signal
  );
  controller.abort();
  expect(await pending).toBeNull();
});
