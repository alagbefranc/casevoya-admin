# Bootstrapping the first platform admin

`public.platform_admins` is empty on production. Until it has a row, every page and every `/api/admin/*`
call answers "not a platform admin yet" (`403 forbidden`, reason `not_platform_admin`). Nothing in either
repo creates a row automatically. **Not run yet: Francis gives the go-ahead.**

The bootstrap is the database function `public.bootstrap_first_platform_admin(p_user_id uuid, p_note text)`
(main repo migration `20261029210000_adm_platform_admin_backend.sql`, applied). It is service-role only,
takes an advisory lock, refuses once any platform admin exists, requires the auth user to have a confirmed
email **and a verified MFA factor**, inserts one row with role `owner` (template reviewer off) and writes
the audit event `platform_admin.bootstrapped`.

## Steps (in order)

1. **Casevoya account.** `admin@casevoya.ca` needs a Casevoya (Supabase auth) account with a password,
   a confirmed email and an enrolled authenticator app (TOTP), because the portal's own sign-in
   (`POST /api/admin/session/sign-in`) is password + authenticator code and every privileged action runs
   as that account. Options for Francis to choose: sign up through app.casevoya.ca and enrol the
   authenticator at `/mfa`, or have an existing account's email changed. The script never creates
   accounts or passwords.
2. **Access sign-in.** Sign in once at https://admin.casevoya.ca (Access one-time PIN to
   `admin@casevoya.ca` + Access MFA). The portal shows "not a platform admin yet". That is expected.
3. **Dry run** on the box:
   ```bash
   bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs
   ```
   It refuses unless `platform_admins` is empty, the email is on `ADMIN_ALLOWED_EMAILS`, Access has a
   recorded sign-in for it, and the auth user exists with a confirmed email and a verified TOTP factor.
4. **Commit** (with Francis's go-ahead):
   ```bash
   bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs --commit
   ```
   It calls `bootstrap_first_platform_admin` (no direct-insert fallback).
5. Reload https://admin.casevoya.ca and sign in with password + code. Further admins are invited from the
   Admins page by an owner (see docs/FRONTEND-SPEC.md, "Platform admins").

The function can never add a second admin: it refuses on a non-empty table.
