# Admin API (`/api/admin/*`)

Server: `src/app/api/admin/[...path]/route.ts` -> `handle()` in `src/lib/api/core.ts`, endpoints in
`src/lib/api/registry.ts` (one module per area under `src/lib/api/modules/`). The full contract, page by
page, with request/response shapes, rules and workflows, is **docs/FRONTEND-SPEC.md**.

## Every request

1. Route: unknown path `404 not_found`; known path, wrong method `405 method_not_allowed` + `Allow`.
2. Gate: Cloudflare Access JWT (`cf-access-jwt-assertion`, re-verified), email on `ADMIN_ALLOWED_EMAILS`,
   Supabase auth user, `platform_admins` row (or an open invite, for the session endpoints only).
3. Mutations (POST/PATCH/PUT/DELETE): `Origin` must equal `ADMIN_ORIGIN` and `Content-Type` must be
   `application/json`, else `403 csrf_failed`.
4. Role: GETs any role (owner, operator, viewer); mutations owner/operator; `/admins*` owner only.
5. Template decisions: `platform_admins.template_reviewer` must be true.
6. Input: zod; `422 validation_failed` with `details.issues[{path, message}]`.
7. Own session: some endpoints run as the admin's own Supabase session (cookie
   `__Host-cv-admin-session`, 1 h). Missing or not the Access user: `401 session_required`. Step-up
   endpoints need a TOTP within 15 minutes, or a `code` in the body: else `403 step_up_required`.
8. Handler, then an audit entry (`platform_admin_record_audit`, action `admin_portal.<area>.<verb>`) for
   every mutation, including denied and failed attempts.

Success: `{ "data": ..., "requestId": "..." }`. Error: `{ "error": { "code", "message", "details"?, "requestId" } }`.
Headers: `cache-control: no-store`, `x-request-id`, `x-content-type-options: nosniff`.

## Tests

`tests/api-endpoints.test.ts` runs authz denial, validation and the happy path for every endpoint in the
registry (and fails if an endpoint has no case); `tests/api-core.test.ts` covers the pipeline (routing,
gate reasons, CSRF, session/step-up, reviewer flag, audit, error mapping, CSV import, helpers).
