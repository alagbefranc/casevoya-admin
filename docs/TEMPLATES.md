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
| Draft / revise | any platform admin (revise: the author only, not while in review) | Access JWT + `platform_admins`; at least one official https source |
| Submit for review / withdraw from review | the draft's author (owner/operator) | service role naming the author (`submit_/withdraw_shared_template_version`). Submitting needs an official source and freezes content and sources until approve, reject or withdraw |
| Approve = publish | the flagged reviewer, never the author; only a submitted draft | portal: `platform_admins.template_reviewer` flag, owner/operator role, licence pre-check, own reviewer session tied to the Access user, fresh TOTP code, confirm tick, the review hash shown with the content (`shared_template_review_hash`, read before the content). Database (`approve_shared_template_version(uuid, text)`): not service role, platform admin, aal2, TOTP within 15 min, active licence, not the author, hash still matches what was shown and what was submitted (else 409 "reload") |
| Reject (reason 3–500 chars) | the flagged reviewer | same session rules as approve |

The reviewer session: password + authenticator code, kept in one httpOnly, Secure, SameSite=Strict,
host-only cookie (idle for at most an hour, and never more than 12 hours after sign-in), used only for the
RPCs that must run as the admin (enforced by `scripts/check-boundaries.mjs`). Every decision needs a step-up
from the last 15 minutes. Rollback also needs an explicit confirmation and a reason; reject needs a submitted draft.
After 5 wrong codes or passwords in 15 minutes, code entry is refused for 15 minutes.

## Adding the reviewer (when their email is known)

1. Cloudflare Access: add their email to the "Casevoya admin" policy (MFA stays required).
2. `wrangler.jsonc` vars: append it to `ADMIN_ALLOWED_EMAILS`; open a PR, merge, `bash scripts/deploy.sh .`.
3. An owner invites them from the Admins page with role operator (or owner) and "template reviewer"
   ticked; they accept the invite after signing in with password + authenticator code.
4. Make sure their licence is verified (see docs/MAIN-APP-CHANGES.md, "What the reviewer needs").
