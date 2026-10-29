# Main-app changes this portal needs (not made here)

Decision 2026-10-29 (Francis): Casevoya is a software provider only. It publishes no immigration
content and needs no RCIC/licensed platform reviewer. Each firm's licensed members build and
approve their own templates. The admin portal is for platform operations only. The CICC register
import is optional and not a launch blocker.

None of the following has been changed in `alagbefranc/casevoya` or its database by this repo.

## Needed to match the decision

1. **ADM-03 shared templates: remove the platform-level licensed-review gate.** Migration from #276
   (`approve_/reject_/rollback_shared_template_version`, migration lines ~441–464) requires a platform
   admin who also holds an active `firm_owner`/`licensed_consultant` licence, and a different author.
   Options: (a) retire platform-published shared templates for launch (no portal screens; firms keep
   their own templates and overrides), or (b) re-scope so a shared starter is published as an
   unreviewed *starter* that a firm's own licensed member must approve before use in that firm.
   Either way: update PRD ADM-03 wording ("licensed reviewer" → firm-side approval), DECISIONS.md,
   and TASKS.md.
2. **Program packs (#277): drop the platform "named Study permit reviewer".** Firm packs already
   publish in-app via `publish_reviewed_program_pack` by the firm's licensed member. Update
   DECISIONS 2026-10-28 and the launch blocker to say firms supply their own reviewer. Platform
   catalogue loads (`promote-official-claim-drafts.mjs`) stay operational, not professional review.
3. **CICC register import: optional / post-launch.** ORG-04 manual verification at launch stays.
4. **`bootstrap_first_platform_admin`** (proposed SQL in `docs/main-app/`): audited, advisory-locked,
   refuses when any row exists. Optional; the bootstrap script works without it.

## Nice to have (replace direct reads with named functions)

5. `platform_firm_overview()` returning firm metadata only (name, verification, subscription,
   active seat count), so the portal stops selecting `organizations`/`memberships` directly.
6. `platform_outbox_health()` returning counts and dead-letter metadata (no payload), and a public
   wrapper for `app.replay_outbox_event` when retries are wanted (not at launch).
7. Docs: support-access.md and DATABASE.md still say "Not applied on the live project" for live tables.
