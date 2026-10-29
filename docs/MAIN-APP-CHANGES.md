# Main-app changes this portal needs (not made here)

**Decision 2026-10-29, corrected 12:05 EST (Francis):** Casevoya KEEPS central shared templates.
Casevoya publishes them; Francis's immigration person (a licensed reviewer, identity and email TBD)
confirms each version before release; each firm can still edit its own copy (firm overrides). The
existing ADM-03 licensed-review gate stays exactly as it is. Only the reviewer's identity is pending.
The CICC register import stays optional and is not a launch blocker.

None of the following has been changed in `alagbefranc/casevoya` or its database by this repo.

## Nothing to change for ADM-03 to work

The template release screens (`/templates`) use the live functions from migration
`20261029130100_adm_shared_templates.sql` unchanged:

| Step | Function | Runs as |
| -- | -- | -- |
| Draft | `draft_shared_template_version` | service role, author = the acting platform admin |
| Revise | `revise_shared_template_draft` | service role (portal allows the author only) |
| Diff | `shared_template_diff` | service role |
| Approve (= publish) | `approve_shared_template_version` | the reviewer's own session, aal2 + TOTP step-up |
| Reject | `reject_shared_template_version` | the reviewer's own session, aal2 + TOTP step-up |

`app.platform_template_reviewer()` keeps refusing the service role, non-platform-admins, a session
without a fresh step-up, and anyone without an active licence; approve keeps refusing the author.

## What the reviewer needs before the first approval (data, not schema)

1. A Casevoya account (auth user) with a verified authenticator app (TOTP), signing in with a password.
2. A `platform_admins` row for that user (via the bootstrap script/RPC, not run).
3. An active `firm_owner` or `licensed_consultant` membership in some firm, with a
   `consultant_credentials` row whose `register_status = 'active'`, not suspended or revoked.
   Prod today has **no** credential with `register_status = 'active'` (10 declared, 1 inactive), so
   the reviewer's licence must be checked first: `record_licence_check` by that firm's owner or a
   platform admin (cites register.college-ic.ca), or a CICC register import.
4. Their email on the Access policy and on the Worker vars `ADMIN_ALLOWED_EMAILS` and
   `TEMPLATE_REVIEWER_EMAILS` (see docs/TEMPLATES.md).

## Optional schema changes (proposed, not applied)

5. **Explicit reviewer flag:** `alter table public.platform_admins add column template_reviewer boolean not null default false;`
   and have `app.platform_template_reviewer()` also require it. Until then, the flag is the portal's
   `TEMPLATE_REVIEWER_EMAILS` plus the licence check in the database.
6. **Structured citations:** the version body is `{title, summary, items}` with no sources. The portal
   stores the official source URLs inside `test_evidence` under an `Official sources:` header and
   checks them against `official_source_domains`. A `sources` array in the body (or a link table to
   `official_sources`), validated by `app.shared_template_body`, would make them first-class.
7. **Program packs (#277):** the first Study permit pack is reviewed by the same immigration person
   (Blocker 1). No schema change; only the named reviewer is pending.
8. **CICC register import:** optional / post-launch. ORG-04 manual verification stays.
9. **`bootstrap_first_platform_admin`** (proposed SQL in `docs/main-app/`): audited,
   advisory-locked, refuses when any row exists. Optional; the bootstrap script works without it.

## Nice to have (replace direct reads with named functions)

10. `platform_firm_overview()` returning firm metadata only, so the portal stops selecting
    `organizations`/`memberships` directly.
11. `platform_outbox_health()` returning counts and dead-letter metadata (no payload), and a public
    wrapper for `app.replay_outbox_event` when retries are wanted (not at launch).
12. Rollback screen for `rollback_shared_template_version` (same reviewer session) — not built yet.
13. Docs: support-access.md and DATABASE.md still say "Not applied on the live project" for live tables.
