# marks

A React Native app for Infinite Campus grades, assignments, schedules, and what-if grades. As of 11 November 2026, the app was taken down by Infinite Campus.

<img width="739" height="418" alt="image" src="https://github.com/user-attachments/assets/4dfb23ac-1948-4c24-823f-ff0ef4fd803a" />


This repo contains the legacy marks API and the marks app. The app is stateless and makes all requests on device, but for a brief period this logic was handled via a Cloudflare Workers backend (`api.marks.cx`), which you can find in `/api/`.

All session data is encrypted on-device.

## Run

```sh
git clone https://github.com/dliu99/marks.git
cd marks
bun install --frozen-lockfile
bun run ios
# Or: bun run android
```

## License

[WTFPL, version 2](LICENSE)
