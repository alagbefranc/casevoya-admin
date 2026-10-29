# Bootstrapping the first platform admin

`public.platform_admins` is empty on production. Until it has a row, every page of the portal shows
"not a platform admin yet" and no action can run. Nothing in this repo or the main repo creates a
row automatically.

## Steps (in order)

1. **Francis signs in once** at https://admin.casevoya.ca:
   - Access sends a one-time PIN to `admin@casevoya.ca` (Cloudflare Email Routing forwards that
     address to Francis's inbox).
   - On first sign-in Access asks him to enrol an MFA device (authenticator app, security key or
     biometrics). Enrolling a second one is recommended to avoid lock-out.
   - The portal then shows "no Casevoya user exists for this email yet". That is expected.
2. **Dry run** on the box:
   ```bash
   bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs
   ```
   It refuses unless `platform_admins` is empty, the email is on the allow list, and Access has a
   recorded sign-in for it. It prints what it would do.
3. **Commit** (with Francis's go-ahead):
   ```bash
   bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs --commit
   ```
   It creates a confirmed, password-less `auth.users` row for `admin@casevoya.ca` if none exists and
   adds the single `platform_admins` row. If the main repo has applied
   `docs/main-app/bootstrap_first_platform_admin.sql`, the insert goes through that audited,
   advisory-locked function; otherwise it uses a guarded direct insert (re-checks emptiness first).
4. Reload https://admin.casevoya.ca. All screens are now available.

The script can never add a second admin: it refuses on a non-empty table.
