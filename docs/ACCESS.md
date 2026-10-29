# Cloudflare Access and DNS for admin.casevoya.ca

Set up 29 Oct 2026 through the Cloudflare API (account `c8010438fc56280e3ea5747a123e818a`, team
domain `orange-resonance-3cfd.cloudflareaccess.com`).

| Piece | State |
|---|---|
| Identity provider | "One-time PIN" (`13f22f6f-46a8-48b1-b7d0-02f592c7cf73`), added for this app. The account's existing "Cloudflare" IdP is limited to account members, which `admin@casevoya.ca` is not |
| Org setting | Independent MFA turned on (TOTP, biometrics, security key; 12 h). **Not** required for all apps, so other Access apps are unchanged |
| Access application | "Casevoya admin" (`76c4d190-fcd6-498d-a63e-5e9b8a968dab`), self-hosted, `admin.casevoya.ca`, only the One-time PIN IdP, 12 h session, binding cookie, SameSite strict, hidden from the App Launcher. AUD `a3f3f4c0…7825` (in `wrangler.jsonc`) |
| Policy | "Allow admin@casevoya.ca with MFA" (`27c25915-8305-45a6-b642-f10a8a768baf`): include email `admin@casevoya.ca`; MFA required (TOTP, security key, biometrics; 12 h) |
| Email | Email Routing rule `f621120949974c559b77a4594e08867b`: `admin@casevoya.ca` → Francis's verified inbox, so the one-time PIN arrives |
| DNS / route | Created by `wrangler deploy` from `routes: [{ pattern: "admin.casevoya.ca", custom_domain: true }]` (Workers custom domain; Cloudflare manages the DNS record) |

The app verifies the Access JWT itself as well (see `src/lib/access.ts`), so removing the Access
application would lock the portal rather than open it.

## Adding the template reviewer

When Francis names the licensed immigration person, add their email to the "Casevoya admin"
policy's include list (keep MFA required) and to `ADMIN_ALLOWED_EMAILS` in `wrangler.jsonc`, then an
owner invites them from the Admins page with "template reviewer" ticked (the flag is the
`platform_admins.template_reviewer` column). See [TEMPLATES.md](TEMPLATES.md).

## Adding any new admin

1. Access policy include list + `ADMIN_ALLOWED_EMAILS` (PR, merge, `bash scripts/deploy.sh .`).
2. An owner invites the email from the Admins page (`POST /api/admin/admins/invites`, fresh step-up).
   No email is sent; tell the person yourself.
3. They sign in through Access, sign in to their Casevoya account (password + authenticator) on the
   portal and accept the invite (`POST /api/admin/session/accept-invite`) within the invite's 1–30 days.

## API requests

`/api/admin/*` sits behind the same Access application, so an unauthenticated request gets Access's
302 to the login page. Behind Access the handler re-verifies the JWT, then checks `platform_admins`,
the Origin header on mutations (`ADMIN_ORIGIN`), the role, the input and, where needed, the admin's own
Supabase session and step-up. See docs/API.md.
