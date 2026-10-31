# Admin API (`/api/admin/*`)

Server: `src/app/api/admin/[...path]/route.ts` -> `handle()` in `src/lib/api/core.ts`, endpoints in
`src/lib/api/registry.ts` (one module per area under `src/lib/api/modules/`). The full contract, page by
page, with request/response shapes, rules and workflows, is **docs/FRONTEND-SPEC.md**.

## Every request

1. Route: unknown path `404 not_found`; known path, wrong method `405 method_not_allowed` + `Allow`.
2. Gate: Cloudflare Access JWT (`cf-access-jwt-assertion`, re-verified), email on `ADMIN_ALLOWED_EMAILS` or
   (checked live) a platform admin's or open invite's email, Supabase auth user, `platform_admins` row (or an open invite, for the session endpoints only).
   The first-admin Setup endpoints (`/setup*`) use the setup gate instead: Access + allow list + an
   **empty** `platform_admins` table (`409 conflict`, `details.locked`, once it is not); see
   docs/BOOTSTRAP.md. The join endpoints (`/join*`, invited admins creating their account and accepting)
   use the join gate: Access + an open invite for that email; the auth user may not exist yet. See
   docs/ACCESS.md.
   Right after the Access JWT verifies (before any Auth or database lookup) the per-caller Workers rate
   limits apply (`src/lib/rate-limit.ts`, bindings in `wrangler.jsonc`): GET 120/min, other methods
   20/min, keyed on the Access subject; `/setup*` and `/join*` also 10/min per Access email. Support-request creation
   and real CICC imports also count against 5/min. Refusals answer `429 rate_limited` with
   `Retry-After: 60`. The throttle fails open when the binding is missing or errors.
3. Mutations (POST/PATCH/PUT/DELETE): `Origin` must equal `ADMIN_ORIGIN` and `Content-Type` must be
   `application/json`, else `403 csrf_failed`.
4. Role: GETs any role (owner, operator, viewer); mutations owner/operator; `/admins*` and
   `PATCH /config/settings/:key` owner only.
5. Template decisions: `platform_admins.template_reviewer` must be true.
6. Input: bodies over 64 KB (template drafts 256 KB, `POST /licences/cicc-imports` 10 MB) answer
   `413 payload_too_large`; then zod, `422 validation_failed` with `details.issues[{path, message}]`.
7. Own session: some endpoints run as the admin's own Supabase session (cookie
   `__Host-cv-admin-session`, 1 h). Missing or not the Access user: `401 session_required`. Step-up
   endpoints need a TOTP within 15 minutes, or a `code` in the body: else `403 step_up_required`.
   A request carrying a `code` (sign-in also carries the password) first reserves an attempt with the
   service-role function `platform_admin_reserve_attempt` (main-app migration) and resolves it with
   `platform_admin_resolve_attempt`; after 5 failed or unresolved attempts in 15 minutes it answers
   `429 rate_limited` (`details.retryAfterSeconds`, also sent as `Retry-After`), and `502` when no
   reservation can be made. Only a password or code Supabase Auth rejected counts as failed; Auth being
   rate limited, erroring or unreachable answers `502` and does not count.
8. Handler, then an audit entry (`platform_admin_record_audit`, action `admin_portal.<area>.<verb>`) for
   every mutation, including denied and failed attempts.

Success: `{ "data": ..., "requestId": "..." }`. Error: `{ "error": { "code", "message", "details"?, "requestId" } }`.
Headers: `cache-control: no-store`, `x-request-id`, `x-content-type-options: nosniff`.

## Endpoints by Designer page

Overview `/overview*` · Firms `/firms*` · Subscriptions `/subscriptions/exceptions` · Usage `/usage` ·
Health `/health*` · Incidents `/incidents` + `/notices*` · Releases `/releases/*` + `/templates*` ·
Config `/config*` (+ `/admins*` for owners) · Audit log `/audit` · Privacy `/privacy/*` ·
Verification `/verification/summary` + `/licences/*` + `/firms/:id/verification` · Grants `/support/*` ·
Sample mode `/sample-mode` · Migration `/migration/jobs` · plus `/session*` everywhere · Setup
`/setup*` (first admin only) · Join `/join*` (invited admins).

Invites: `POST /admins/invites` creates the invite, adds the email to the Access policy (only single-email
rules; any other rule makes it refuse and cancel the invite) and emails a `/join` link
(`{ id, email, acceptUrl, accessAdded, emailSent, emailError }`). Cancelling an invite and removing an admin
re-sync the policy (`accessRemoved`, `accessError`).

Read-only stubs (no data source yet, response carries `stub: true` and a `gap` sentence):
`GET /releases/app-notes`, `GET /privacy/breaches`, and `featureFlags` inside `GET /config`.

Settings: `GET /config` marks each setting `editable` with `allowed_units`. Only `{unit, count}` settings
are editable (`trial.duration`, `licence.recheck_interval`, `licence.manual_check_target`,
`source.recheck_interval.*`); `PATCH /config/settings/:key` takes `{ value: { unit, count }, reason }`
and returns `409 conflict` for any other key, `422` on `value.unit` for the wrong unit.

The full page-by-page frontend contract is `docs/FRONTEND-SPEC.md`.

## Tests

`tests/api-endpoints.test.ts` runs authz denial, validation and the happy path for every endpoint in the
registry (and fails if an endpoint has no case); `tests/api-core.test.ts` covers the pipeline (routing,
gate reasons, CSRF, session/step-up, reviewer flag, audit, error mapping, CSV import, helpers);
`tests/setup.test.ts` covers the setup gate and every `/setup*` endpoint (locked, lockout, passwords,
factors, bootstrap call); `tests/join.test.ts` the join gate and `/join*`; `tests/access-policy.test.ts`
the Access policy sync (never widening) and the invite email.
