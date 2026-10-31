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

## Inviting an admin (from the portal, no Cloudflare steps)

1. An owner opens **Config › Admins › Invite an admin**, enters the email, picks a role (owner, operator or
   viewer; each is described on the form), optionally ticks "template reviewer", and presses **Send invite**
   (fresh authenticator code needed). `POST /api/admin/admins/invites`:
   - creates the invite (`platform_admin_invite`, the owner's own session);
   - rewrites the Access policy include list to `ADMIN_ALLOWED_EMAILS` + every platform admin + every open invite
     (`src/lib/access-policy.ts`). Only single-email rules are ever written; if the policy holds any other rule
     (a domain, everyone, a group) nothing changes and the invite is cancelled. If Cloudflare refuses, the invite
     is cancelled too, so nothing is half-done;
   - emails the person a link to `https://admin.casevoya.ca/join` from `notices@casevoya.ca` (Cloudflare Email
     Sending). If only the email fails, the invite stays and the owner sees the link to send themselves.
2. The person opens the link, enters the one-time PIN Access emails them, then on `/join` creates their Casevoya
   account (or signs in to their existing, confirmed one), adds an authenticator app and accepts
   (`/api/admin/join*`, the join gate: Access JWT + an open invite). An unconfirmed existing account is refused,
   never taken over.
3. Cancelling an invite or removing an admin re-syncs the policy, which takes the email off Access. An expired
   invite stops working at once in the portal (the server checks expiry) and leaves the Access policy at the next
   invite, cancel or removal.

The Worker's own allow list (`verifyAccessJwt`) is `ADMIN_ALLOWED_EMAILS` plus, checked live with the service
role, any email with an open invite or a `platform_admins` row. So no var change or redeploy is needed per admin,
and removal or expiry revokes access by itself. `ADMIN_ALLOWED_EMAILS` stays the static base and is never removed
from the policy.

Config: vars `CF_ACCOUNT_ID`, `CF_ACCESS_APP_ID`, `CF_ACCESS_POLICY_ID`, `ADMIN_MAIL_FROM` in `wrangler.jsonc`;
secret `CF_ADMIN_TOKEN` (`bash scripts/set-worker-secret.sh CF_ADMIN_TOKEN`), an account token limited to
"Access: Apps and Policies Write" and "Email Sending Write". Without them the portal refuses to invite.

Template reviewers: invite them with "template reviewer" ticked (the `platform_admins.template_reviewer` flag).
See [TEMPLATES.md](TEMPLATES.md).

## API requests

`/api/admin/*` sits behind the same Access application, so an unauthenticated request gets Access's
302 to the login page. Behind Access the handler re-verifies the JWT, then checks `platform_admins`,
the Origin header on mutations (`ADMIN_ORIGIN`), the role, the input and, where needed, the admin's own
Supabase session and step-up. See docs/API.md.
