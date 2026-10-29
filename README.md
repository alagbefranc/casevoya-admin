# casevoya-admin

Platform operations console for Casevoya, served at **https://admin.casevoya.ca**.

This console runs the platform: firms, delivery health, service notices, support access and
**shared template releases** (ADM-03). Casevoya publishes central templates; Francis's licensed
immigration person (the reviewer, identity TBD) confirms each version before release; each firm can
still edit its own copy. See [docs/TEMPLATES.md](docs/TEMPLATES.md).

## Stack

Next.js 16 on Cloudflare Workers via OpenNext, the same as the main app (`alagbefranc/casevoya`).
Worker `casevoya-admin`, custom domain `admin.casevoya.ca`, no workers.dev or preview URLs.
It talks to the production Supabase project (`aqjtvqmojfamtspzyeqm`, ca-central-1) from the server
only, with the service-role key held as a Worker secret.

## Security model

1. **Cloudflare Access** application "Casevoya admin" covers `admin.casevoya.ca`. Its only policy
   allows `admin@casevoya.ca`, signing in with a one-time PIN plus Access independent MFA (TOTP,
   security key or biometrics, 12 h session). See [docs/ACCESS.md](docs/ACCESS.md).
2. **Every page and every server action** calls `requireAdmin()` (`src/lib/guard.ts`), which
   - verifies the `Cf-Access-Jwt-Assertion` JWT itself (team-domain JWKS, issuer, this app's AUD,
     expiry) and checks the email against `ADMIN_ALLOWED_EMAILS`, then
   - resolves that email's `auth.users` id and requires a row in `public.platform_admins`.
3. The service-role client is created only after both checks pass, only on the server.
4. **Reads** touch a short allow list of platform-operations tables (no client content).
   **Writes** go only through the main app's named, audited database functions, naming the
   acting platform admin. `pnpm check:boundaries` (CI and deploy) enforces all of this.

## Screens

| Screen | What it does |
|---|---|
| Firms | Read-only metadata: name, verification, subscription state, active seats, created date |
| Service health | Outbox counts and the dead-lettered events (view only; no retries) |
| Service notices | Post, update and resolve maintenance / incident / info notices (ADM-04) |
| Support access | Request and cancel firm-approved support access (SEC-04/09); list and history |

Template releases: approve/reject run in the licensed reviewer's own Supabase session with a fresh TOTP step-up, never as the service role and never by the draft's author (docs/TEMPLATES.md).

## Develop

```bash
pnpm install
pnpm verify          # boundaries, lint, typecheck, tests
pnpm build
```

Local `next dev` has no Access JWT, so every page shows the "not through Cloudflare Access" notice.

## Deploy (from the box only)

```bash
bash scripts/set-worker-secret.sh   # once, or after a key rotation
bash scripts/deploy.sh .            # clean tree, no .env*.local, boundary check, build, placeholder guard, secret scan, deploy
```

## First admin

`public.platform_admins` starts empty. Bootstrapping is a one-time step that needs Francis's own
sign-in first: see [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md).
