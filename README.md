# marks

A React Native app for Infinite Campus grades, assignments, schedules, and what-if grades. As of 11 November 2026, the app was taken down by Infinite Campus.

<img width="1206" height="2622" alt="image" src="https://github.com/user-attachments/assets/e79869f8-598b-4107-a685-4b261aa26eb9" />

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
