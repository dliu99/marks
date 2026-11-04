# marks

A React Native app for Infinite Campus grades, assignments, schedules, and what-if grades. As of 11 November 2026, the app was shut down by 

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

Use a native development build, not Expo Go.

No environment variables or hosted Marks backend are required for a new sign-in. Find your district in the app, or paste its full HTTPS Infinite Campus login URL.

Optional configuration is documented in [.env.example](.env.example).

## License

[WTFPL, version 2](LICENSE)
