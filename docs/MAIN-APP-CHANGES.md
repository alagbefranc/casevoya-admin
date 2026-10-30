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
| Submit / withdraw review | `submit_shared_template_version`, `withdraw_shared_template_version` (20261030140000) | service role, actor = the draft's author |
| Review hash | `shared_template_review_hash` (20261030140000) | service role, read before the content shown |
| Approve (= publish) | `approve_shared_template_version(uuid, text)` (hash-bound overload) | the reviewer's own session, aal2 + TOTP step-up |
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
4. Their email on the Access policy and the Worker var `ADMIN_ALLOWED_EMAILS`, and
   `platform_admins.template_reviewer = true` (set by an owner on the Admins page).

## Optional schema changes (proposed, not applied)

5. **Explicit reviewer flag:** DONE in `20261029210000_adm_platform_admin_backend.sql`
   (`platform_admins.template_reviewer`, required by `app.platform_template_reviewer()`, together with
   roles owner/operator/viewer, invites, step-up and the bootstrap function).
6. **Structured citations:** DONE in the same migration (`shared_template_version_sources`, set with
   `set_shared_template_version_sources`; publishing needs at least one official source). Before it, the version body is `{title, summary, items}` with no sources. The portal
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

## Added for the Designer pages (casevoya PR #283, migration `20261029220000`, applied 2026-10-29)

Five service-role-only, metadata-only reads, each guarded by `app.platform_read_allowed()`:
`platform_usage`, `platform_privacy_requests`, `platform_sample_overview`, `platform_migration_jobs`,
`platform_template_releases`. The Config page writes through the existing `set_product_setting`
(own session, platform admin at step-up).

Still missing in the main app (the portal shows a stub and the spec flags the gap):

- a `release_notes` table written at deploy time (Releases > App release notes);
- a feature-flag store with per-firm or percentage targeting (Config > Feature flags);
- a breach (privacy incident) register (Privacy > Breach register);
- `product.setting_changed` is not in the `platform_audit_log` families, so the database's own event
  for a setting change does not show in Audit log; the portal's `admin_portal.config.setting_changed`
  entry does.
