# Legacy Marks API

The standalone mobile app connects directly to Infinite Campus. This Cloudflare Worker is retained for older-client compatibility and session migration, plus optional operator diagnostics. It is not required for new sign-ins or offline data.

## Local development

```sh
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run dev
```

Wrangler prints the local address (normally `http://localhost:8787`). `/docs` exposes the API reference. Configure your own server-only `IRON_KEY` and Supabase credentials before using database-backed routes. The mobile app must never contain the server key or service-role key.

The legacy tables are `ic_sessions` and `web_pair_attempts`. The Worker defaults to allowing browser requests only from `http://localhost:3000`; configure your own allowed origins if hosting a web client. Treat this as compatibility code that needs a separate deployment/security review before operating a public backend.

## Checks

```sh
bun test
bun run typecheck
bunx wrangler deploy --dry-run
```

Install root dependencies too for the TypeScript checks. Worker packaging itself must resolve from this directory's dependencies alone.

Only access sessions you are authorized to inspect. Raw reports can contain student data and must not be committed or attached to public issues.
