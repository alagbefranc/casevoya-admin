# Shared template releases (ADM-03)

Casevoya publishes central templates to every firm. A platform admin drafts a version; Francis's
licensed immigration person (the reviewer) compares it with the current version and its official
sources and approves (publishes) or rejects it with a reason. Firms adopt a published version and can
still edit their own copy.

## Screens

- `/templates`: review queue (open drafts), published versions, recent decisions, new draft form.
- `/templates/<version id>`: the database's diff (`shared_template_diff`) against the current
  published version, both bodies side by side, official-source citations (each URL marked official
  or not against `official_source_domains`), test evidence, changelog, decisions, and, for an open
  draft, approve/reject (reviewer) or revise (author).

## Who can do what

| Action | Who | Checks |
| -- | -- | -- |
| Draft / revise | any platform admin (revise: the author only) | Access JWT + `platform_admins`; at least one official https source |
| Approve = publish | the flagged reviewer, never the author | portal: on `TEMPLATE_REVIEWER_EMAILS`, licence pre-check, own reviewer session tied to the Access user, fresh TOTP code, confirm tick. Database: not service role, platform admin, aal2, TOTP within 15 min, active licence, not the author |
| Reject (reason 3–500 chars) | the flagged reviewer | same as approve |

The reviewer session: password + authenticator code, kept in one httpOnly, Secure, SameSite=Strict,
host-only cookie for at most an hour, used only for the two RPCs (enforced by
`scripts/check-boundaries.mjs`). Every decision asks for a fresh code.

## Adding the reviewer (when their email is known)

1. Cloudflare Access: add their email to the "Casevoya admin" policy (MFA stays required).
2. `wrangler.jsonc` vars: append it to `ADMIN_ALLOWED_EMAILS` and set `TEMPLATE_REVIEWER_EMAILS`
   to it; open a PR, merge, `bash scripts/deploy.sh .`.
3. Give their auth user a `platform_admins` row (needs Francis's go-ahead; same guarded path as the
   bootstrap, or a platform admin in the Supabase SQL editor).
4. Make sure their licence is verified (see docs/MAIN-APP-CHANGES.md, "What the reviewer needs").
