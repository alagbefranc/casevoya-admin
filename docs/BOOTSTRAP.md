# Bootstrapping the first platform admin

`public.platform_admins` is empty on production until the first owner finishes **Setup**. The bootstrap is
the database function `public.bootstrap_first_platform_admin(p_user_id uuid, p_note text)` (main repo
migration `20261029210000_adm_platform_admin_backend.sql`, applied). It is service-role only, takes an
advisory lock, refuses once any platform admin exists, requires the auth user to have a confirmed email
**and a verified MFA factor**, inserts one row with role `owner` (template reviewer off) and writes the
audit event `platform_admin.bootstrapped`. It can never add a second admin.

## In the portal: Setup (`/setup`) — the normal path

While `platform_admins` is empty, an Access user whose email is on `ADMIN_ALLOWED_EMAILS` who opens
https://admin.casevoya.ca is sent from `/` to `/setup` (the "No access" screen is shown only when Setup
is not open). Nothing on app.casevoya.ca and no script is needed.

1. **Account.** The work email is read-only and comes from the Cloudflare Access JWT. Enter your full name
   and a password (at least 12 characters, checked in the browser and on the server).
   - If a Casevoya auth user already exists for that email, the password is checked by signing in. A
     wrong password offers **Set a new password** (only while Setup is open). If the existing user's
     email is unconfirmed, its password is not accepted and **Set a new password** is required; that
     path removes every MFA factor on the account, then confirms the email and sets the new password.
   - If no user exists, one is created with the email already confirmed.
   - The full name is saved to `user_metadata.full_name`. You now have the normal portal session
     (cookie `__Host-cv-admin-session`, the same one the Sign-in dialog creates).
2. **Authenticator app.** A TOTP factor is enrolled on your own session; the QR code and the manual key
   are shown only on the page (never logged or audited). Enter the 6-digit code to verify it; the session
   becomes `aal2`. Reloading keeps the factor you already scanned (you just enter its code); **Show a
   different QR code** removes only unverified factors and starts again. A factor that is already verified
   is reused, never deleted. Passkeys: coming later.
3. **Finish.** Tick the confirmation and **Finish setup**: the server checks the aal2 session and the
   verified factor, then calls `bootstrap_first_platform_admin(<your user id>, 'first admin via admin
   portal Setup')` with the service role. You are the **owner** and go to the Overview.

After that `/setup` shows **Setup is locked** for good, and every Setup endpoint answers `409 conflict`
(`details.locked: true`). The server decides on every request; the browser state is not trusted.

### Server rules (src/lib/api/modules/setup.ts, src/lib/guard.ts `evaluateSetupGate`)

- Every `/api/admin/setup*` request needs a valid Access JWT for an allowed email (`401`/`403` otherwise)
  and an empty `platform_admins` table (`409` otherwise). Mutations also pass the usual CSRF check.
- Lockout: 5 wrong passwords or codes for the Access email within 15 minutes answer `429 rate_limited`
  until the window passes. Attempts are counted from the portal's own audit rows
  (`admin_portal.setup.*`, result `failure`, `context.setup_bad_attempt`), so it holds across Workers.
- Audit (`platform_admin_record_audit`): `admin_portal.setup.account`, `.password_reset`,
  `.authenticator_started`, `.authenticator_verified`, `.finished`, including failed and denied attempts.
  Context carries the Access email and the request id, never a password, code or TOTP secret.
- Needs the Worker secret `SUPABASE_PUBLISHABLE_KEY` (the same as the Sign-in dialog). Without it Setup
  shows a warning and points here.

## Fallback: the server script

Use this only if Setup cannot be used (for example the publishable key is missing). The account must
already exist with a confirmed email and a verified TOTP factor (the script never creates accounts or
passwords), and the email must have signed in to admin.casevoya.ca once through Access.

```bash
bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs            # dry run, prints the checks
bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs --commit   # calls the function
```

It refuses unless `platform_admins` is empty, the email is on `ADMIN_ALLOWED_EMAILS`, Access has a
recorded sign-in for it, and the auth user has a confirmed email and a verified TOTP factor. It calls
`bootstrap_first_platform_admin` (no direct-insert fallback). Either way, further admins are invited from
Config › Admins by an owner (docs/FRONTEND-SPEC.md, "Admins").
