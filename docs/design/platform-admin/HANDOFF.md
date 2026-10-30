# Platform admin: design handoff for engineering

This is a design prototype for the Casevoya platform admin, used by the Casevoya team only. It is static HTML/JS that shows how screens look and behave, not production code. Rebuild it in the app's own stack.

## What's here
- `prototype/admin.html`, `prototype/src/admin.js` (screens and states) and `prototype/shell.js` (navigation, including the new "Casevoya team > Admins" group). They need the design kit (`../kit/*.js`, fonts, brand assets), which is **not** included because this repo is public and the kit contains licensed icon sets. Treat the screenshots as the source of truth.
- `screenshots/areas/`: the original admin tabs at 1440 and 390.
- `screenshots/additions/`: the new and redesigned screens and their states at 1440 and 390.
- `MEBIUS-CHARTS.md`: notes on the chart style reference.

## Tabs (13) plus setup
Overview, Firms, Verification, Subscriptions, Usage and quotas, Service health, Support grants, Template releases, Incidents, Privacy requests, Audit, Configuration, Admins (new). Separately, a first-admin **Setup** screen (`?tab=setup`) with a **locked** version (`&locked=1`) once setup has been done.

## States
Use `?state=loading|empty|error` to see a state.
- Overview, Admins, Service health and Setup each have loading, empty and error states (screenshots in `additions/`).
- Errors show a request ID and say plainly that nothing was changed.

## Admins tab
Invite a teammate (needs a @casevoya.ca email; link works once and expires in 7 days; two-factor sign-in required), a licensed-reviewer flag, pending invites, and removal. Removing someone needs a reason and typing `REMOVE`.

## Service health: two-step retry
Stuck messages table, then Retry:
1. Re-authenticate with a 6-digit code or passkey.
2. Confirm. The screen shows the message ID, what happens and what happens if it fails again (dead letter plus a follow-up task for the firm). A reason is required and is written to Audit. Then "Retry now".

## Setup (first admin)
Takes the bootstrap token, name, @casevoya.ca email and a password; the next step sets up a passkey or authenticator. Afterwards the page locks for good (token destroyed, logged as audit entry boot_0001). See `docs/BOOTSTRAP.md`.

## Charts
The Overview charts copy the *look* of Mebius "Free Charts" (Keitoto Studio) from its public previews only, and were written from scratch with Casevoya tokens (#0075DE, #F6F5F4, #111, Inter body text, Erode headings, 22px rounded corners). No Mebius code or Figma files were used or included. Their downloads need an account and their license forbids passing the files on. In the throughput chart, Delivered and Retried are side by side on the same scale, so Retried bars are small on purpose (at least 3px tall).

## Known small kit issues (not fixed)
1. **Sidebar double highlight:** on Service health, "Overview" also looks active in the sidebar.
2. **Spinner overlap at 390:** on the Setup error state, the spinner on "Try again" overlaps the word "Try".

## Not included
The design kit, Core UI Pro or Hugeicons icon files or sprites, Mebius files, and anything secret. Screenshots only show the rendered icons.

## Spec alignment pass (29 Oct 2026)
Brought the prototype in line with `docs/FRONTEND-SPEC.md`:
- Session screens: no access, gate error, invite, sign-in, step-up, access ended, session mismatch.
- Overview renamed "Operations": 5+4 cards, newest firms, support grants, no-impersonation line, no charts (meters only from real counts).
- Health dead letters with retry confirm (reason 8–500, "Queued for retry"); Config › Admins (owners only, last-owner lock, typed-email remove, invites).
- Stubs/notes for unbuilt items: feature flags, breach register, invite email delivery, read-only switches, audit export, emergency procedure, usage notice, app release notes.
- Nav grouped Operate / Platform / Records; midnight top bar; amber metadata-only banner; single active highlight.
- Shared states via `?state=`, viewer/operator role variants via `?role=`, form validation, sub-pages.
Screenshots: `screenshots/spec-pass/` (63 views × 1440/390, contact sheets `contact-1440.jpg`, `contact-390.jpg`).
Licensed icons/fonts/kit and Mebius files are not included; the prototype expects them at `../assets` and `../kit` when run locally.
