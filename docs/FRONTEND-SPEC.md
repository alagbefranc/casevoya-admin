# Casevoya admin portal: frontend specification

Status: backend built and deployed to admin.casevoya.ca (casevoya-admin PRs #5, #6 and #7, main-app
PRs #282 and #283). This document tells a frontend engineer how
to build every page of `admin.casevoya.ca` against that backend **without reading the backend code**.
Every rule below is marked by where it is enforced:

- **[DB]** the Casevoya database refuses the action itself (cannot be bypassed by any client);
- **[API]** the admin API (`/api/admin/*`) refuses it before the database is called;
- **[UI]** a hint the frontend must show or apply; the server does not enforce it;
- **[NOT BUILT]** described for completeness, does not exist yet. Do not fake it in the UI.

References:

- Designer's full admin design: 14 pages (**Overview, Firms, Subscriptions, Usage, Health, Incidents,
  Releases, Config, Audit log, Privacy, Verification, Grants, Sample mode, Migration**), each captured at
  1440 px and 390 px. *The capture file paths had not reached this repo when this spec was written;
  the layouts below follow the page names and must be checked against those captures. Where a capture
  and this spec disagree on layout, the capture wins; where they disagree on data or rules, this spec
  wins (it describes what the backend does).*
- Prototype: `casevoya/prototype/app.js` route `#/admin` and `prototype/shots/admin-1440.png`,
  `admin-390.png` (midnight header "Platform administration", amber demo strip, "Operations" counts,
  Firms table, Support grants list with "There is no impersonation button").
- `casevoya/docs/spec/DESIGN.md` §5 "Platform administration" (separate portal; default cards: firm
  count, subscription exceptions, queue health, verification workload, incident status; support grants
  show scope and expiry; client content is never the default view) and §6 component contracts, §7 status
  colours, §9 motion, §10 accessibility, §11 empty states, §12 breakpoints (1440, 390; validate 360, 768,
  1024, 1280).
- `docs/API.md` (pipeline summary), `docs/BOOTSTRAP.md` (first admin), `docs/ACCESS.md`,
  `docs/TEMPLATES.md`.

Contents: 1 Global · 2 Pages (Overview, Firms, Subscriptions, Usage, Health, Incidents, Releases, Config,
Audit log, Privacy, Verification, Grants, Sample mode, Migration) · 3 Session and invite screens ·
4 End-to-end walkthroughs · 5 Not built and gaps · 6 Endpoint index.

---

## 1 Global

### 1.1 Calling the API

- Base: same origin, `/api/admin`. Always `credentials: "same-origin"` (the Cloudflare Access cookie
  and the admin session cookie `__Host-cv-admin-session` ride along; the frontend never reads them).
- GET parameters go in the query string, camelCase (`?flaggedOnly=true&limit=50`). Booleans accept
  `true/false/1/0`.
- Mutations (POST, PATCH): JSON body, header `content-type: application/json`. The browser sends
  `Origin` automatically; it must be `https://admin.casevoya.ca` **[API]**, so never call the API from
  another origin or a server-side proxy that drops `Origin`.
- Path ids are UUIDs except `/templates/history/:key` (template key) and `/config/settings/:key`
  (setting key).
- Responses are `cache-control: no-store`. Do not cache in a service worker. Client-side caching
  (SWR/React Query) is fine with the polling rules in 1.9.
- Every response has an `x-request-id` header; success bodies carry `requestId` too.

**Success**: `{ "data": <payload>, "requestId": "…" }` with status 200, or 201 for creates
(`POST /notices`, `POST /support/requests`, `POST /templates/drafts`, `POST /admins/invites`).

**Error** (every endpoint, same shape):

```json
{ "error": { "code": "validation_failed", "message": "Give a reason of 8 to 500 characters",
             "details": { "issues": [ { "path": "reason", "message": "Give a reason of 8 to 500 characters" } ] },
             "requestId": "…" } }
```

| code | HTTP | Meaning | What the UI does |
|---|---|---|---|
| `unauthenticated` | 401 | Access JWT missing or invalid | Full-page "Your Cloudflare Access sign-in ended" + **Reload** (Access re-prompts). |
| `forbidden` | 403 | Not on the allow list, no Casevoya account, not a platform admin, wrong role, not a template reviewer, or the database refused | Inline alert with `message`; for whole pages, the permission-denied state (1.8). |
| `session_required` | 401 | The endpoint runs as your own Casevoya session and you have none, or it belongs to someone else | Open the **Sign-in dialog** (3.2), then retry the same request once. |
| `step_up_required` | 403 | Needs an authenticator code from the last 15 minutes | Open the **Step-up dialog** (3.3); resend the same body with `code` added (or after a successful `/session/step-up`). |
| `csrf_failed` | 403 | Wrong `Origin` or not JSON | Bug: show "This request was blocked. Reload the page." Log `requestId`. |
| `validation_failed` | 422 | Input failed checks (API or DB) | Map `details.issues[].path` to fields (dot paths, e.g. `sources.0.url`); unmatched issues and DB messages (no `details`) go in the form's error summary. Never clear the form. |
| `not_found` | 404 | Unknown id or route | Page-level not-found with a link back to the list. |
| `method_not_allowed` | 405 | Bug | Same as csrf_failed. |
| `conflict` | 409 | State changed underneath you (already open draft, pending request exists, resolved notice, already an admin, concurrent update) | Alert with `message` + **Refresh** that reloads the record; keep form input. |
| `rate_limited` | 429 | Too many wrong passwords or codes in Setup (5 in 15 minutes) | Show `message`; the user waits out the window (3.6). |
| `upstream_error` | 502 | Database or Supabase failure | "Casevoya's database did not answer. Try again." + **Retry**; keep input. |
| `internal` | 500 | Configuration or unexpected error | Same as upstream, plus the `requestId` ("Quote this reference: …"). |

Network failure (fetch throws, opaque redirect, HTML instead of JSON): the Access session expired at
the edge and Cloudflare is redirecting to its login. Show the `unauthenticated` state with **Reload**.

Database messages are written for people ("only a dead-lettered event can be retried"); show them
as-is, capitalising the first letter.

### 1.2 Lists and paging

- List payloads: `{ items: [...], total, limit, offset, ... }`. Keys in responses are **snake_case**
  (database names); inputs are **camelCase**.
- Offset paging: `limit` (default 50 unless stated, max 200) and `offset`. Show "1–50 of 312" and
  Previous/Next. Changing a filter resets `offset` to 0.
- Audit log uses a cursor instead (`next_cursor`), see Audit log.
- Keep filters in the URL query string so pages are shareable and Back works.

### 1.3 Who you are: `GET /session`

Called once on load by the shell, again after sign-in, step-up, sign-out, invite acceptance and every
5 minutes (1.9).

Response `data`:

```json
{
  "email": "admin@casevoya.ca",
  "userId": "uuid",
  "role": "owner | operator | viewer | null",
  "templateReviewer": false,
  "licensed": false,
  "verifiedFactors": 1,
  "invite": null,
  "session": { "signedIn": true, "userId": "uuid", "aal": "aal2", "expiresAt": 1761780000,
               "stepUpAt": 1761776400, "stepUpFreshUntil": 1761777300, "matchesAccessUser": true },
  "capabilities": { "read": true, "operate": true, "manageAdmins": true, "reviewTemplates": false,
                    "acceptInvite": false, "signInAvailable": true },
  "environment": { "supabaseUrl": "https://….supabase.co", "adminOrigin": "https://admin.casevoya.ca" }
}
```

- `role: null` means the Access user has an **open invite** and nothing else; `invite` is
  `{ id, role, template_reviewer, expires_at, invited_at }`. Render only the invite screen (3.4).
- If the gate refuses entirely (not on the allow list, no Casevoya account, not an admin and no invite)
  `/session` returns `403 forbidden` with a message. Then call `GET /setup`: `200` (no platform admin
  exists yet) → `router.replace("/setup")` (3.6); anything else → the "No access" screen (3.5).
- `capabilities` drive what the UI shows **[UI]**; the API enforces the same rules **[API]**:
  - `read`: any admin. Every GET.
  - `operate`: owner or operator. Every POST/PATCH except `/admins*` and `/config/settings/*`.
  - `manageAdmins`: owner. `/admins*` and `PATCH /config/settings/:key`.
  - `reviewTemplates`: not a viewer, `templateReviewer` flag on, and `licensed` (holds a verified
    licence in a Casevoya firm as firm owner or licensed consultant) **[DB]**.
  - `signInAvailable`: false means the server has no Supabase publishable key; hide sign-in and show
    "Own-session actions are unavailable on this deployment."
- Times are Unix seconds. `stepUpFreshUntil` is when the database stops accepting the last code.

### 1.4 Roles

| Role | Sees | Can do |
|---|---|---|
| viewer | Every page and every GET | Nothing that writes. Action buttons hidden, not disabled, except where the page explains who can act ("Operators post notices"). |
| operator | Everything | Notices, support requests, dead-letter retry, licence checks and imports, template drafts; template decisions if also reviewer and licensed. |
| owner | Everything | All operator actions, plus Admins (invite, cancel invite, role, reviewer flag, remove) and Config setting changes. |

The last owner cannot be demoted or removed **[DB]**.

### 1.5 Shell and navigation

Layout from the prototype and DESIGN §5: midnight top bar (`--midnight`, white text) with the Casevoya
mark, the label **Platform administration**, a spacer, the session chip (1.6), **Exit** (link to
`https://app.casevoya.ca`), and an avatar menu (email, role, "Sign out of admin session",
"Cloudflare Access sign-out" = `/cdn-cgi/access/logout`).

Below it, the **demo/metadata banner** (1.7), then a 240 px left sidebar at ≥1280 px with the 14 pages
in this order and grouping (names exactly as the Designer's):

- **Operate**: Overview, Firms, Subscriptions, Usage, Verification, Grants
- **Platform**: Health, Incidents, Releases, Config
- **Records**: Audit log, Privacy, Sample mode, Migration

Routes: `/` Overview, `/firms`, `/firms/[id]`, `/subscriptions`, `/usage`, `/health`, `/incidents`,
`/releases` (tabs; `/releases/templates/[id]` for a version), `/config` (tabs; `/config/admins`
owner-only), `/audit`, `/privacy`, `/verification` (`/verification/credentials/[id]`), `/grants`
(`/grants/[id]`), `/sample-mode`, `/migration`. The existing routes keep working and redirect:
`/notices` → `/incidents?tab=notices`, `/support` → `/grants`, `/templates` → `/releases?tab=templates`,
`/templates/[id]` → `/releases/templates/[id]`.

Attention counts next to nav items come from `GET /overview` (1.9): Subscriptions =
`subscriptions.exceptions`; Verification = `licences.due + licences.adverse + licences.needs_review`;
Grants = `support.pending`; Health = dot coloured by `queues.level`; Incidents = `incidents.active`;
Releases = `templates.awaiting_review`. Counts are badges with text ("3 due"), never colour alone.

768–1279 px: sidebar collapses to a 64 px icon rail with labels in tooltips and an expand button.
<768 px (390 design): the top bar keeps the mark, "Admin", the session chip as an icon and a **Menu**
button opening a full-height drawer with the same groups; the banner stays below the bar.

### 1.6 Session chip and fresh-MFA notices

The admin portal has two sign-ins: **Cloudflare Access** (gets you to the site; required for every
call) and your **own Casevoya session** (password + authenticator code; needed only for actions the
database checks as you). The chip in the top bar shows the second:

| State (from `session`) | Chip | Notice |
|---|---|---|
| `signedIn: false` | grey "Not signed in" | none until an action needs it |
| signed in, `stepUpFreshUntil` in the future | green "Verified · 12 min" (counts down each minute from `stepUpFreshUntil`) | none |
| signed in, step-up stale | blue "Signed in" | none |
| `matchesAccessUser: false` | amber "Session mismatch" | Alert: "Your admin session belongs to a different user. Sign out and sign in again." |

Fresh-MFA rule (applies to every action marked **step-up** below): the database accepts the action only
within 15 minutes of an authenticator code **[DB]**; the API checks first **[API]**. The UI:

1. Before submitting a step-up action, if `stepUpFreshUntil - now < 60 s`, show the code field inside
   the confirmation dialog itself ("Enter the 6-digit code from your authenticator app") and send it as
   `code` in the same body. Otherwise send without `code`.
2. If the response is `session_required`, open Sign-in (3.2), then resubmit.
3. If `step_up_required`, open Step-up (3.3) or show the inline code field, then resubmit.
4. Never store the code; clear it after each attempt. Codes are exactly 6 digits **[API]**.

No countdown animation; update the minutes text once a minute (DESIGN §9).

### 1.7 Demo and metadata-only banner

Always visible under the top bar, amber strip with flask icon:

- Normal: "**Operational metadata only.** No client content is shown here. Client content needs a
  firm-approved, time-limited support grant; there is no impersonation."
- When `GET /overview` → `firms.sample > 0`: append "Firms marked *(sample)* are demo firms."
- Firm names with `sample_mode: true` render with a "Sample" neutral badge everywhere.

The backend guarantees metadata only **[DB]**: no list or detail returns document contents, file
names, message text, requester names of privacy requests, complaint text or notes.

### 1.8 Page states (every data page)

| State | Rendering |
|---|---|
| Loading | Skeleton rows/cards matching the layout; no spinner over 10 s without text (after 10 s: "Still loading…" + Retry). |
| Empty | Sentence saying what belongs here and one authorised action (given per page). |
| Filtered empty | "Nothing matches these filters." + **Clear filters**. |
| Validation error | Field errors + error summary at the top of the form, linked to fields. |
| Provider failure | `upstream_error`/`internal`: Alert "Casevoya's database did not answer" + Retry; keep last data visible marked "Stale since 14:05". |
| Permission denied | `forbidden` on a page GET: "You don't have access to this page." Show role. |
| Offline | `navigator.onLine === false`: banner "You're offline. Showing data from 14:05." Disable actions. |
| Stale data | When a poll fails, keep data with a "Last updated 14:05 (EST)" line in amber. |

### 1.9 Polling

Poll only while the tab is visible (`document.visibilityState === "visible"`); refetch on focus.

| Data | Interval |
|---|---|
| `GET /session` | 5 min, and on focus |
| `GET /overview` (shell nav counts and Overview) | 60 s |
| `GET /health` (Health page) | 30 s |
| `GET /incidents` | 60 s |
| `GET /support/requests` (Grants) | 30 s while any item is `pending` or `active`, else 120 s |
| `GET /migration/jobs` | 60 s while `summary.active > 0`, else none |
| Everything else | No polling; refetch after mutations and on focus |

Back off to 2× the interval after a failed poll, up to 5 min.

### 1.10 Formatting

- Show times in the viewer's zone with a zone label (e.g. "Oct 29, 2026, 1:40 PM EST"); relative time
  ("12 min ago") may accompany but not replace it. Privacy dates (`*_on`) are calendar dates in
  America/Toronto; show them as dates without a time.
- Bytes: binary units (KB, MB, GB) to one decimal. Money: AI costs are USD (`ai_cost_usd_30d`) and
  labelled "USD"; invoice cents are in the invoice `currency` (CAD), show "CAD".
- Unknown enum values: show the raw value in a neutral badge (never crash).
- Status colours (DESIGN §7): neutral = draft/inactive; blue = in progress/info; amber = attention/due
  soon/near limit/degraded; red = failed/overdue/over limit/unhealthy/adverse; green = verified/healthy
  completion. Badges always carry text.

### 1.11 Components

Build these once (DESIGN §6 contracts apply: 44 px targets, visible focus, labelled inputs):

- **AppShell** (top bar, banner, sidebar/rail/drawer, session chip).
- **MetricCard** (number or word, label, optional status badge, link). Row of 4 at 1440, 2×2 at 390.
- **DataTable** (caption, sortable headers where the endpoint sorts, pagination, empty/filtered-empty,
  48 px rows; at <768 px rows become stacked cards using `data-l` labels as in the prototype).
- **FilterBar** (search input debounced 300 ms, selects, toggle chips; URL-synced).
- **StatusBadge** (text + colour).
- **Drawer** (details and edit forms on desktop; full-screen sheet on mobile; unsaved-change guard).
- **ConfirmDialog** (title, plain consequence text, optional reason textarea with counter, optional
  typed confirmation, optional inline 6-digit code field, primary + cancel; focus trap, Esc closes,
  focus returns).
- **SignInDialog**, **StepUpDialog** (3.2, 3.3).
- **Alert** (persistent, with next action) and **Toast** (acknowledgement only).
- **Timeline** (audit-style events: time, actor email, action, result).
- **JsonDiff** (template before/after by field; settings before/after).
- **CountdownText** (minutes left, updates per minute, no animation).
- **StubPanel** (for `stub: true` responses: neutral panel "Not available yet" + the `gap` sentence).
- **RequestIdNote** ("Reference: <requestId>" on errors).

---

## 2 Pages

Each page lists: route, purpose, roles, layout, data, actions, states, mobile, polling, **What an
admin can achieve here**, and **Logic and rules**.

### 2.1 Overview

**Route** `/` · **Roles** all · **Purpose** the landing view: is the platform healthy and what needs a
person today. Never shows client content (DESIGN §5).

**Layout (1440)** Page title "Operations". Row of 5 MetricCards (DESIGN §5 defaults): Firms, Subscription
exceptions, Queues, Verification workload, Incident status. Second row of 4 smaller cards: Support
grants (pending/active), Templates awaiting review, Complaints overdue, Support response time. Below,
two columns: left "Firms" (the 5 newest firms, from `/firms?limit=5`, columns Firm, Plan, Verification,
Subscription, as in the prototype) and right "Support grants" (active and pending, from
`/support/requests?state=active` and `?state=pending`, rows as in the prototype: key icon, "Firm ·
matter <ref or 'firm settings'>", reason · status · "expires in 42 min", badge). Under the grants list,
the prototype's line: "Client content needs a firm-approved, time-limited grant. There is no
impersonation button."

**Data**

`GET /overview` → `data`:

```json
{
  "firms": { "total": 3, "live": 2, "sample": 1, "by_verification": { "verified": 2, "pending_review": 1 } },
  "subscriptions": { "exceptions": 1, "by_reason": { "past_due": 1 }, "by_status": { "active": 1, "trial": 1, "past_due": 1 } },
  "queues": { "level": "healthy|degraded|unhealthy", "counts": { "pending": 0, "processing": 0, "published": 812, "failed": 0, "dead_lettered": 0 },
              "oldest_pending_wait_seconds": 0, "processing_stuck": 0, "failed_last_hour": 0 },
  "licences": { "due": 2, "overdue": 0, "never_checked": 1, "adverse": 0, "needs_review": 0, "all": 6 },
  "verification_workload": { "firms_pending_review": 1, "firms_unverified": 0, "credentials_needing_review": 0, "credentials_never_checked": 1 },
  "incidents": { "active": 0, "active_incidents": 0, "worst_severity": null, "status": "operational|maintenance|incident|major_incident" },
  "support": { "pending": 0, "active": 1 },
  "templates": { "awaiting_review": 0, "published": 4 },
  "complaints": { "open": 0, "ack_overdue": 0, "response_overdue": 0, "total": 0 },
  "generated_at": "2026-10-29T18:40:00Z"
}
```

`GET /overview/support-sla?days=30&targetMinutes=1440` (days 1–365, targetMinutes 5–10080) →
`{ days, target_minutes, received, responded, awaiting_response, awaiting_over_target, within_target, breached, median_minutes, … }`.

`GET /overview/complaints` → `{ totals: {open, ack_overdue, response_overdue, total}, by_category: {<category>: n}, by_firm: [{organization_id, firm_name, open, ack_overdue, response_overdue}] }`
(used in the Complaints card's drawer).

Cards:

| Card | Value | Badge | Link |
|---|---|---|---|
| Firms | `firms.total` ("2 live · 1 sample") | none | /firms |
| Subscription exceptions | `subscriptions.exceptions` | amber if > 0 | /subscriptions |
| Queues | word from `queues.level` (Healthy/Degraded/Unhealthy) | green/amber/red | /health |
| Verification workload | `licences.due + licences.adverse + licences.needs_review + verification_workload.firms_pending_review` ("2 licence checks due") | amber if > 0, red if `adverse` > 0 | /verification |
| Incident status | Operational / Maintenance / Incident / Major incident from `incidents.status` | green/blue/amber/red | /incidents |
| Support grants | `support.active` active · `support.pending` pending | blue if active | /grants |
| Templates awaiting review | `templates.awaiting_review` | amber if > 0 | /releases?tab=templates |
| Complaints overdue | `complaints.ack_overdue + complaints.response_overdue` | red if > 0 | drawer with by_firm |
| Support response time | median minutes and `breached` of `received` in 30 days | amber if `awaiting_over_target` > 0 | none |

**Actions** none (read-only page; links only).

**States** Loading: 5+4 card skeletons. Empty (no firms at all): Firms card "0", Firms list "No firms
have signed up yet." Error: per-section; a failed `/overview` shows the alert across the cards.

**Mobile (390)** Cards in a 2-column grid (Queues and Incident status first), then Support grants,
then Firms as stacked cards. The impersonation line stays visible.

**Polling** `/overview` every 60 s; grants lists every 30 s while any is active.

**What an admin can achieve here** See in one screen whether anything on the platform needs a person:
unpaid or failing subscriptions, stuck background jobs, licences that need checking, incidents in
progress, support access in use, templates waiting for a reviewer and firms behind on complaint
deadlines; then jump to the page that fixes it.

**Logic and rules**

- Subscription exception = a firm whose subscription has at least one reason (**[DB]**, same
  definition everywhere): `past_due` (status past_due), `restricted`, `trial_ended`,
  `cancel_scheduled` (active/trial/past_due with a cancel date), `trial_ending` (trial ending within
  3 days), `invoice_unpaid` (latest invoice open or uncollectible, not cancelled/archived).
- Queue level **[DB]**: `unhealthy` if any dead-lettered event or the oldest due pending event waited
  > 1 h; `degraded` if waited > 10 min, any failure in the last hour, or any event processing > 15 min;
  else `healthy`.
- Licence buckets **[DB]**: see Verification (2.11). "Due" counts due within 7 days plus overdue.
- Incident status **[DB]**: from published notices whose window covers now: `major_incident` if any
  major incident, else `incident`, else `maintenance`, else `operational`.
- Complaint overdue **[DB]**: unresolved and not acknowledged after `ack_due_on`, or no response after
  `response_due_on`, using each firm's local date.
- Support SLA: computed from support response records (when a firm's support ticket arrived and when
  Casevoya first replied). Recording those records is done with the ops script, **[NOT BUILT]** in the
  portal.
- No side effects. Edge cases: on a brand-new platform every count is 0 and `worst_severity` is null.

### 2.2 Firms

**Route** `/firms`, detail `/firms/[id]` · **Roles** all · **Purpose** find a firm and see its
account metadata.

**Layout (1440)** Title "Firms" + FilterBar: search (name, legal name, slug or exact id; ≤100 chars),
Verification select (unverified, pending_review, verified, restricted), Subscription select (trial,
trial_ended, active, cancelled, past_due, restricted, archived, none, exception), Plan select (solo,
practice, firm, enterprise), Sample toggle (all / live only / sample only), Sort (Newest, Oldest, Name
A–Z, Name Z–A). DataTable columns: Firm (display name; legal name under it in muted text; Sample
badge), Plan, Verification, Subscription (badge + exception reasons as small amber chips), Members
(active), Created. Row click opens the detail page.

**Data** `GET /firms?search=&verification=&subscription=&plan=&sample=&sort=created_desc|created_asc|name_asc|name_desc&limit=50&offset=0`
→ `{ total, limit, offset, items: [{ id, display_name, legal_name, slug, verification_status, sample_mode, created_at, subscription_status, plan, billing_interval, trial_ends_at, current_period_end, exception_reasons: [], active_members }] }`.

Detail `GET /firms/:id` →

```json
{
  "firm": { "id", "display_name", "legal_name", "slug", "verification_status", "sample_mode", "created_at", "timezone",
            "default_locale", "jurisdiction_codes", "dpa_accepted_at", "dpa_version", "subscription_terms_accepted_at", "subscription_terms_version" },
  "subscription": null | { "status", "plan", "billing_interval", "extra_seats", "trial_started_at", "trial_ends_at", "current_period_end",
            "cancel_at", "cancelled_at", "past_due_since", "restricted_at", "archived_at", "latest_invoice_status",
            "stripe_customer_id", "stripe_subscription_id", "exception_reasons", "updated_at" },
  "subscription_events": [{ "kind", "occurred_at", "stripe_event_id" }],
  "invoices": [{ "id", "status", "amount_due_cents", "amount_paid_cents", "currency", "created_at" }],
  "members": { "active", "invited", "suspended", "by_role": { "firm_owner": 1 } },
  "credentials": [{ "id", "licence_type", "college_id", "status", "register_status", "checked_at", "next_review_at" }],
  "support_requests": [{ "id", "status", "scope", "ticket_ref", "created_at", "ends_at", "open" }],
  "complaints": { "open", "ack_overdue", "response_overdue", "total" },
  "outbox": { "pending", "failed", "dead_lettered" }
}
```

Detail layout: header (name, Sample badge, verification badge, subscription badge, slug, created);
tabs or stacked panels: **Account** (timezone, locale, jurisdictions, DPA and terms acceptance),
**Subscription** (status, plan, interval, extra seats, dates, exception reasons, Stripe ids with a
link `https://dashboard.stripe.com/customers/<stripe_customer_id>` opening in a new tab; events
timeline; invoices table with CAD amounts), **People** (counts only: active/invited/suspended, by
role), **Licences** (credentials table → `/verification/credentials/[id]`; button "Why is this firm
<status>?" → `/firms/:id/verification` drawer), **Support** (requests → `/grants/[id]`; **Ask for
support access** button for operators → Grants form prefilled with this firm), **Usage** (link to
`/usage?search=<slug>`), **Health** (outbox pending/failed/dead-lettered → `/health`), **Complaints**
(counts), **Notices** (link "Post a notice to this firm" → Incidents form with this firm listed),
**Audit** (link `/audit?organizationId=<id>`).

`GET /firms/:id/verification` → `{ firm: {id, display_name, verification_status}, credentials: [<credential detail as in 2.11>], rule: "<sentence>" }`.

**Actions** none on the firm itself (see Logic). Cross-links only.

**States** Empty: "No firms yet. Firms appear here when they sign up in Casevoya." Filtered empty as 1.8.
Detail 404: "This firm does not exist."

**Mobile** Filters collapse into a "Filters (2)" button opening a sheet; rows become cards (name,
badges, plan · members). Detail panels stack; Stripe link stays.

**Polling** none.

**What an admin can achieve here** Find any firm by name, slug or id; see its plan, subscription
health, verification, member counts, licences, support history, complaint workload and background-job
health; and jump to the action pages (support access, notices, licence checks, audit) for that firm.

**Logic and rules**

- Read-only by design: platform admins cannot edit a firm's profile, members, plan or subscription
  from the portal **[API: no endpoint]**. Subscription changes come from Stripe webhooks; firm owners
  change their own settings in Casevoya.
- `exception` filter = firms with at least one exception reason (2.1); `none` = firms with no
  subscription row.
- Verification status rule **[DB]**, after every licence check: a firm with a verified licence becomes
  `verified`; a verified firm left with no verified licence and with a revoked, suspended, inactive
  or not-entitled credential becomes `restricted`; otherwise unchanged. `pending_review` and
  `unverified` are set in the firm's onboarding, not by the portal.
- Member data is counts only **[DB]**; no names or emails of firm staff.
- Edge: a firm without a subscription row shows "No subscription" (neutral) and no Stripe link.

### 2.3 Subscriptions

**Route** `/subscriptions` · **Roles** all · **Purpose** the firms whose billing needs attention, and the
status mix across all firms.

**Layout (1440)** Title "Subscriptions". Summary strip: one chip per `by_status` entry ("Active 12",
"Trial 3", "Past due 1", …) and one per `by_reason` ("Past due 1", "Trial ending 2", …); clicking a
reason chip filters the table. DataTable "Exceptions": Firm (Sample badge), Status, Plan · interval,
Reasons (amber/red chips), Key date (the most relevant of `past_due_since`, `trial_ends_at`,
`cancel_at`, `current_period_end`), Latest invoice, Stripe (link icon to
`https://dashboard.stripe.com/customers/<stripe_customer_id>`), Updated. Secondary tab "All firms by
subscription" reuses the Firms table with the Subscription filter (`GET /firms?subscription=…`).

**Data** `GET /subscriptions/exceptions?reason=past_due|restricted|trial_ended|cancel_scheduled|trial_ending|invoice_unpaid&limit=100&offset=0`
(limit ≤200, default 100) →
`{ total, by_reason: {<reason>: n}, by_status: {<status>: n}, limit, offset, items: [{ organization_id, firm_name, sample_mode, status, plan, billing_interval, reasons: [], trial_ends_at, current_period_end, cancel_at, past_due_since, restricted_at, latest_invoice_status, stripe_customer_id, updated_at }] }`.

**Actions** none in the portal. Row click → `/firms/[organization_id]` (Subscription panel).

**States** Empty: green Alert "No subscription exceptions. Every firm's billing is in order." Filtered
empty per 1.8.

**Mobile** Chips scroll horizontally; rows become cards (firm, status badge, reasons, key date).

**Polling** none (refetch on focus).

**What an admin can achieve here** See which firms are past due, restricted, at the end of a trial,
about to cancel or holding an unpaid invoice, how long each has been in that state, and open the
firm's Stripe customer to follow up.

**Logic and rules**

- Reasons and their definitions are in 2.1 **[DB]**. `trial_ending` uses a 3-day window. A firm can
  have several reasons; it appears once.
- Severity colouring **[UI]**: red for `restricted`, `past_due`, `invoice_unpaid`; amber for
  `trial_ending`, `trial_ended`, `cancel_scheduled`.
- State transitions (trial → active/trial_ended, active → past_due → restricted → cancelled/archived)
  happen in Casevoya from Stripe webhooks and the `subscription.grace` setting (past due for
  `past_due_days`, then restricted). The portal does not change them **[NOT BUILT: no admin billing
  actions, no comped plans, no manual extension]**.
- Side effects: none.

### 2.4 Usage

**Route** `/usage` · **Roles** all · **Purpose** per-firm seats, active matters, storage and AI use
against the firm's plan limits.

**Layout (1440)** Title "Usage". Totals strip from `totals`: seats in use, active matters, storage,
AI runs (30 days), AI cost USD (30 days); plus "3 firms near or over a limit" (`flagged_total`) as an
amber chip that toggles `flaggedOnly`. FilterBar: search, "Near or over a limit only" toggle, Sort
(Name, Seats, Matters, Storage, AI cost). DataTable: Firm (Sample badge, plan and subscription status
under the name), Seats (`seats_active / seat_limit` with a thin meter; "+2 invited" muted), Matters
(`active_matters / matter_limit`; "4 sample" muted), Storage (`storage_bytes / storage_limit_bytes`
formatted), AI 30 d (`ai_runs_30d` runs · `ai_failed_30d` failed · USD cost). A "Plan allowances"
info popover lists `plans` (seats, matters, storage GB per plan).

**Data** `GET /usage?search=&flaggedOnly=false&sort=name_asc|seats_desc|matters_desc|storage_desc|ai_cost_desc&limit=50&offset=0` →

```json
{
  "items": [{ "organization_id", "display_name", "slug", "sample_mode", "plan", "subscription_status",
              "seats_active", "seats_invited", "seat_limit", "active_matters", "sample_matters", "matter_limit",
              "storage_bytes", "storage_limit_bytes", "ai_runs_30d", "ai_failed_30d", "ai_tokens_30d", "ai_cost_usd_30d",
              "flags": ["seats_near", "storage_over"] }],
  "total": 18, "flagged_total": 3,
  "totals": { "seats_active", "active_matters", "storage_bytes", "ai_runs_30d", "ai_cost_usd_30d" },
  "plans": { "solo": { "seats": 2, "matters": 100, "storage_gb": 25, "monthly_cents": 12900 }, "practice": {…}, "firm": {…} },
  "near_threshold": 0.9, "ai_window_days": 30, "limit": 50, "offset": 0
}
```

Meter colours: `<metric>_over` red, `<metric>_near` amber, otherwise neutral. A `null` limit shows
"No limit" (enterprise) or "Trial: no plan limit" (trial, trial_ended, no plan) in muted text and no
meter.

**Actions** none (row click → `/firms/[organization_id]`).

**States** Empty: "No firms yet." Filtered empty with flaggedOnly: green "No firm is near or over a
plan limit."

**Mobile** Each firm is a card with four labelled meters stacked; sort and filter in a sheet.

**Polling** none.

**What an admin can achieve here** Spot firms that have outgrown their plan (more staff seats, open
matters or stored documents than the plan allows) or are about to, and see which firms drive AI cost,
so sales or support can talk to them before limits bite.

**Logic and rules** (all **[DB]**, computed by `platform_usage`)

- Allowances come from the `subscription.plans` setting. Seat limit = plan seats + purchased extra
  seats. Storage limit = `storage_gb` × 1024³ bytes.
- No limit (null) for trial, trial ended, no subscription, and enterprise.
- Seats = active staff memberships; invited staff shown separately and not counted. Active matters =
  matters not closed (sample matters included, also shown separately). Storage = sum of stored
  document version sizes. AI = Vo runs in the last 30 days (runs, failed, tokens, cost in USD).
- Flags: `<metric>_over` when used > limit; `<metric>_near` when used ≥ 90 % of the limit (and not
  over). Metrics: seats, matters, storage. AI has no plan limit, so no AI flag.
- `flagged_total` and `totals` cover the filtered set (search applied), not just the page.
- Enforcement of limits inside Casevoya is not part of this page; the portal only reports
  **[NOT BUILT: no per-firm override of limits]**.
- Edge: a firm with no documents shows 0 B; costs are rounded to cents in the UI.

### 2.5 Health

**Route** `/health` · **Roles** all (retry: operators) · **Purpose** background-job (outbox) health and
the dead-letter queue.

**Layout (1440)** Title "Health" + level badge (Healthy / Degraded / Unhealthy) and "Checked 14:05
(EST)". Cards: Pending, Processing, Failed (last hour), Dead-lettered, Oldest wait ("4 min"), Stuck
processing. Small table "Dead letters by event type". Then DataTable "Dead letters" with an
event-type filter: Event type, Firm, Attempts, Occurred, Last error (first line, 300 chars), **Retry**
button (operators). Row click opens a Drawer with the event detail. A thresholds footnote: "Degraded
after 10 min wait, any failure in the last hour or processing over 15 min; unhealthy with any dead
letter or over 1 h wait."

**Data**

- `GET /health` → `{ level, counts: {pending, processing, published, failed, dead_lettered}, oldest_pending_at, oldest_pending_wait_seconds, processing_stuck, failed_last_hour, dead_letters_by_type: [{event_type, count}], thresholds: {degraded_wait_seconds: 600, unhealthy_wait_seconds: 3600, stuck_processing_minutes: 15}, checked_at }`.
- `GET /health/dead-letters?eventType=&limit=50&offset=0` → `{ total, limit, offset, items: [{ id, event_type, aggregate_type, organization_id, firm_name, attempts, occurred_at, available_at, last_error }] }`.
- `GET /health/dead-letters/:id` → `{ id, status, event_type, schema_version, aggregate_type, aggregate_id, organization_id, firm_name, attempts, occurred_at, available_at, locked_at, published_at, last_error (≤1000), payload_keys: [], payload_bytes, replays: [{ at, actor_email, result, action }] }`.
  The payload itself is never returned; show its keys and size.

**Actions**

| Action | Endpoint | Body | Who | Confirmation | Step-up |
|---|---|---|---|---|---|
| Retry a dead letter | `POST /health/dead-letters/:id/retry` | `{ reason: string 8–500, code?: "123456" }` | owner, operator | ConfirmDialog "Retry this <event_type> event? It will be sent again to its handler (for example, an email may go out)." Reason textarea required. | **Yes** (own session) |

Success → `{ id, status: "pending", replayed_by }`; toast "Queued for retry"; refetch `/health`,
the dead-letter list and the drawer (the replay appears in `replays`). Errors: `validation_failed`
"only a dead-lettered event can be retried" (someone else retried it: refresh), `not_found`,
`session_required`, `step_up_required` (1.6).

**States** Empty dead letters: green "No dead letters. Every event was delivered or is still being
tried." Error: keep last data marked stale.

**Mobile** Cards 2 per row; dead letters as cards with Retry full-width; drawer becomes a sheet.

**Polling** `/health` every 30 s; dead-letter list every 60 s while non-empty.

**What an admin can achieve here** Know whether Casevoya's background work (emails, notifications,
webhooks, licence events) is flowing, find events that failed permanently, read why, and send one back
for another try with a recorded reason.

**Logic and rules**

- Level thresholds as in 2.1 **[DB]**.
- Retry: only `dead_lettered` events **[DB]**; reason 8–500 characters **[API][DB]**; owner/operator
  **[API][DB]**; your own session at aal2 with a code within 15 min **[DB]**. The database sets the event back to
  `pending` with `attempts = 0`, available now; the outbox worker picks it up on its next run.
- Side effects: the handler runs again; if it sends an email or notification, that happens again
  (there is no dedupe guarantee across a manual retry). Audit: `outbox.replay` (database) and
  `admin_portal.health.replay` (portal), both shown in the drawer's `replays` and in Audit log.
- Bulk retry **[NOT BUILT]**. Discarding a dead letter **[NOT BUILT]**.
- Edge: if the retry fails again it returns to `failed` and eventually dead-letters again; the
  replay history shows each attempt.

### 2.6 Incidents

**Route** `/incidents` (tabs: **Incident log**, **Notices**) · **Roles** all (post/edit/resolve:
operators) · **Purpose** the incident and maintenance record, and the service notices firms see in
Casevoya.

**Layout (1440)** Header: current status badge (Operational / Maintenance / Incident / Major incident
from `current.status.status`) with "N active notices", plus queue level from `current.queues.level`
linking to Health. Button **Post a notice** (operators).

*Incident log tab*: filters State (All / Open / Resolved), Kind (Incidents / Maintenance / Both).
DataTable: Title, Kind, Severity (info/minor/major badge), Phase (Draft, Scheduled, Live, Ended,
Resolved), Started (`starts_at`), Resolved (`resolved_at`), Duration ("1 h 30 min", or "Ongoing"),
Audience (All firms / N firms). Row → notice drawer.

*Notices tab*: all notices (including `info`), filter by status (draft/published/resolved), same
columns plus Kind. Row → notice drawer.

Notice drawer: title, badges, body text (as firms see it), window, audience with the listed firms,
resolution note, and a History timeline (audit events for this notice). Buttons by phase: **Edit**,
**Publish** (draft), **Resolve** (published).

**Data**

- `GET /incidents?state=all|open|resolved&kind=incident|maintenance|both&limit=50&offset=0` →
  `{ current: { status: { active, active_incidents, worst_severity, status }, queues: { level, counts, oldest_pending_wait_seconds, processing_stuck, failed_last_hour } }, items: [{ id, kind, severity, title, starts_at, ends_at, status, audience, published_at, resolved_at, resolution_note, created_at, updated_at, phase, duration_minutes }], total, limit, offset }`.
- `GET /notices?status=draft|published|resolved&limit=50&offset=0` → `{ items: [{ id, kind, severity, title, body, starts_at, ends_at, status, audience, published_at, resolved_at, resolved_by, resolution_note, created_by, updated_by, created_at, updated_at, version, phase, targets: [{ id, display_name }] }], total, limit, offset }`.
- `GET /notices/:id` → `{ notice: {…same…}, history: { items: [audit rows], limit, next_cursor } }`.

**Actions**

| Action | Endpoint | Body | Validation |
|---|---|---|---|
| Post | `POST /notices` (201) | `{ kind: "maintenance"\|"incident"\|"info", severity: "info"\|"minor"\|"major" (default minor), title, body, startsAt?: ISO with zone, endsAt?: ISO with zone, audience: "all"\|"listed", organizationIds: uuid[] (≤1000), publish: boolean (default true) }` | title 3–120; body 1–1000; maintenance needs `endsAt`; `endsAt` after `startsAt` (or after now); `listed` needs ≥1 firm; `all` lists none; every listed firm exists **[API][DB]** |
| Edit / publish | `PATCH /notices/:id` | `{ severity?, title?, body?, startsAt?, endsAt?, publish?: boolean }` (only send changed fields; `publish: true` publishes a draft) | same field rules; resolved notices refused `409 conflict` **[API]** |
| Resolve | `POST /notices/:id/resolve` | `{ resolutionNote: 3–1000 }` | only a published notice **[DB]** |

Form: Kind radio, Severity radio, Title, Body (counter), Starts (date-time; empty = now), Ends
(required for maintenance), Audience (All firms / Choose firms: firm multi-select combobox backed by
`GET /firms?search=`), "Save as draft" vs **Publish** buttons. Confirmation for Publish: "Publish to all
firms? Every firm's staff will see this notice in Casevoya from <start>." Resolve: dialog with the note
("Firms will see this note.").

Success: post returns the notice with `phase`; toast "Notice published" / "Draft saved"; refetch
`/incidents`, `/notices`, `/overview`. No step-up needed for notices (service-role action audited with
your identity).

**States** Empty log: "No incidents recorded. Post a notice when something affects firms." Empty
notices: "No notices yet."

**Mobile** Tabs become a segmented control; table → cards; form full-screen; firm multi-select as a
searchable list.

**Polling** `/incidents` every 60 s.

**What an admin can achieve here** Tell firms about an outage or maintenance window from one place,
target all firms or specific ones, keep the notice current while it lasts, close it with a resolution
note firms can read, and review how long past incidents lasted.

**Logic and rules**

- The incident log **is** the service notices of kind `incident` (and `maintenance` when asked)
  **[API]**. There is no separate incident table: a postmortem, cause field or timeline of updates is
  **[NOT BUILT]**.
- Phase **[API]**: `draft` (not published); `resolved`; `scheduled` (published, start in the future);
  `ended` (published, end passed, not resolved); else `live`.
- Status machine **[DB]**: draft → published (publish) → resolved (resolve). Draft and published can
  be edited; resolved is frozen **[API]**. Deleting a notice **[NOT BUILT]**. Unpublishing **[NOT BUILT]**.
- `starts_at` defaults to now **[DB]**. Duration = resolved − (start or published), in minutes **[API]**.
- Platform status (header) counts only published notices whose window covers now **[DB]**.
- Side effects: published notices show in Casevoya to staff of the targeted firms (service-notice banner) once
  inside their window; resolved notices show as resolved with the note. No email is sent for notices
  **[DB: none queued]**. Audit: `service_notice.*` (database) and `admin_portal.notices.*` (portal).
- Who: owner/operator post, edit, resolve **[API]**; viewers read.
- Edge: a notice whose end passed but was never resolved shows `ended`; prompt operators with
  "Ended but not resolved: add a resolution note" **[UI]**.

### 2.7 Releases

**Route** `/releases` (tabs: **Template releases**, **Templates** (review queue), **App release notes**);
version page `/releases/templates/[id]` · **Roles** all read; drafts: operators; decisions: template
reviewers · **Purpose** what changed for firms: shared template versions (Casevoya's reviewed
checklists that firms adopt) and app release notes.

**Layout (1440)**

*Template releases tab*: DataTable of versions that reached firms: Template (title, key muted),
Version (v3), Status (Published green / Superseded neutral / Rolled back red), Effective on, Published,
Reviewer (label), Author, Adopting firms, Changelog (first line). Row → version page.

*Templates tab* (the existing `/templates` page): one row per template: Title, key, Published version
(vN, date, reviewer), Open draft (vN by author, created, sources count with "0 official" in amber),
Adopted by N firms; buttons **New draft** (operators), **Review** on rows with a draft (reviewers).
Above it the official-domains list as a collapsible "Official sources we accept" (from
`/templates/official-domains`).

*App release notes tab*: StubPanel with the `gap` sentence.

*Version page*: header (title, key, vN, status badge, effective date); side-by-side **diff** (JsonDiff
by field: title, summary, items; added items green, removed red, with text labels "Added"/"Removed");
Sources list (position, title, host, Official badge, retrieved on, note; link opens in new tab);
Test evidence; Changelog; Reviews timeline (decision, reviewer label, reason, time); History link
(`/templates/history/:key`). Action bar by status and capability (below).

**Data**

- `GET /releases/templates?limit=50&offset=0` → `{ items: [{ version_id, template_id, stable_key, title, version_number, status, effective_on, published_at, reviewed_at, reviewer_label, author_name, changelog, adopting_firms }], total, limit, offset }`.
- `GET /releases/app-notes` → `{ items: [], total: 0, limit, offset, stub: true, gap: "No data source yet: …" }`.
- `GET /templates` → `{ templates: [{ id, stable_key, title, updated_at, published: null|{ id, version_number, published_at, reviewer_label }, draft: null|{ id, version_number, author_name, author_user_id, created_at, effective_on, sources, official_sources }, adopted_by_firms }] }`.
- `GET /templates/official-domains` → `{ items: [{ host, match_kind, authority }] }`.
- `GET /templates/history/:key` → `{ stable_key, versions: [{ id, version_number, status, body, author_name, test_evidence, effective_on, changelog, reviewer_label, reviewed_at, published_at, published, superseded }] }`.
- `GET /templates/versions/:id` → `{ version: { id, template_id, stable_key, version_number, status, body: { title, summary, items: [] }, content_hash, author_name, author_user_id, test_evidence, effective_on, changelog, supersedes_version_id, reviewer_label, reviewed_at, published_at, created_at, updated_at }, sources: [{ position, url, host, official, title, retrieved_on, note }], reviews: [{ decision, reviewer_label, reason, decided_at }], hints: { isAuthor, hasOfficialSource }, diff: { version_id, version_number, status, before: body|null, after: body, changes: [{ field: "title"|"summary"|"items", before, after }] } }`.

**Actions**

| Action | Endpoint | Body | Who | Step-up | Confirmation |
|---|---|---|---|---|---|
| New draft | `POST /templates/drafts` (201) | `{ stableKey: ^[a-z][a-z0-9_]{1,60}$, authorName 1–120, title 1–160, summary ≤2000, items: string[1–80] each 1–200, testEvidence 8–2000, effectiveOn: "YYYY-MM-DD", changelog 3–2000, sources: [{ url: https…, title?, retrievedOn?, note? }] 1–20 }` | owner, operator | no | none (it is a draft) |
| Revise own draft | `PATCH /templates/versions/:id` | same minus `stableKey`, `authorName` (sources are replaced as a whole) | the draft's author only (`forbidden`) **[API]**; status must be draft (`conflict`) **[API]** | no | unsaved-change guard |
| Approve and publish | `POST /templates/versions/:id/approve` | `{ confirmCompared: true, code? }` | reviewer (2.7 rules) | **yes** | Dialog with checkbox "I compared this draft with the published version and its sources" (maps to `confirmCompared`), text "Publishing replaces vN for N adopting firms; they are notified in Casevoya." |
| Reject | `POST /templates/versions/:id/reject` | `{ reason 3–500, code? }` | reviewer | **yes** | Dialog with reason |
| Roll back | `POST /templates/versions/:id/rollback` | `{ reason 3–500, code? }` | reviewer | **yes** | Destructive dialog: "Withdraw vN and restore vN-1 for N firms?" |

Draft/revise success returns the version detail (as GET). If the draft saved but its sources did not,
the API returns an error whose `details.versionId` is the saved draft: navigate to it and show "The
draft was saved, but its sources were not: <message>". Decision success →
`{ result, version: <detail> }`; rollback `result` = `{ id, status: "rolled_back", restored: <id> }`.
Refresh: version page, `/templates`, `/releases/templates`, `/overview`.

Buttons shown **[UI]**: New draft if `capabilities.operate`; Revise if `hints.isAuthor` and status
draft; Approve/Reject if `capabilities.reviewTemplates`, status draft and **not** `hints.isAuthor`
(Approve disabled with reason "Add at least one official source" when `!hints.hasOfficialSource`);
Roll back if `capabilities.reviewTemplates` and status published. When `supersedes_version_id` is null the dialog warns "There is no earlier version: the template will have no published version" (rollback still succeeds, `restored` is null) **[DB]**.

**States** No templates: "No shared templates yet. Write the first draft." No releases: "Nothing has
been published to firms yet." Draft without official source: amber Alert on the version page.

**Mobile** Diff stacks before/after vertically per field; action bar sticks to the bottom.

**Polling** none.

**What an admin can achieve here** Draft a change to a shared checklist with its official sources and
test evidence, have a second, licensed reviewer compare it with what firms use today and publish it,
reject it with a reason, or withdraw a bad release and put the previous one back; and see every
release with how many firms it reached.

**Logic and rules**

- Version states **[DB]**: `draft` → `published` (approve) or `rejected` (reject); the previously
  published version becomes `superseded`; `published` → `rolled_back` (rollback) and the version it
  superseded, if any, returns to `published`. Only the published version can be rolled back **[DB]**. Only one open draft per template (`conflict` "a draft of this
  template is already open") **[DB]**. Rejected and rolled-back versions are final; write a new draft.
- A new `stableKey` creates the template; an existing key adds a version **[DB]**.
- Reviewer rules **[DB]** (the API pre-checks role and flag **[API]**): owner/operator, the
  `template_reviewer` flag set by an owner, a verified licence (firm owner or licensed consultant
  membership with a verified credential), own session at aal2 with a code within 15 min. The author
  cannot approve their own version **[DB]**. Reject and roll back do not exclude the author **[DB]**;
  the UI hides Reject for the author as a hint only **[UI]**.
- Publishing needs at least one source on the official-domain list **[DB]** ("list at least one
  official source before publishing"). Sources must be https **[API]**.
- Side effects: approve and rollback write a notice to every firm that adopted the template (shown in
  Casevoya's template area) **[DB]**; no email. Audit: `template.version_*` (database) and
  `admin_portal.templates.*` (portal).
- App release notes: **[NOT BUILT]**, stub only.

### 2.8 Config

**Route** `/config` (tabs: **Settings**, **Switches**, **Feature flags**, **Admins** (owners only;
`/config/admins`)) · **Roles** all read settings; owners change settings and manage admins ·
**Purpose** platform settings and who administers the platform.

**Layout (1440)**

*Settings tab*: DataTable: Key (monospace), Description, Value (formatted: `{unit, count}` as "14
days"; other shapes as compact JSON), Pending confirmation (amber "Unconfirmed" badge), Updated,
Version. Rows with `editable: true` have **Change** (owners). Change opens a Drawer: current value,
Count (number 1–3650), Unit (select from `allowed_units`), Reason (3–500), inline code field when
step-up is stale; preview "Trial length: 14 days → 21 days".

*Switches tab*: list of `switches` (key, description, On/Off badge). Read-only with the note "Switches
cannot be changed from the portal yet."

*Feature flags tab*: StubPanel with `featureFlags.gap`.

*Admins tab* (owners): see 2.8.1.

**Data** `GET /config` →
`{ settings: [{ key, value, description, pending_confirmation, created_at, updated_at, version, editable, allowed_units }], switches: [{ key, enabled, description, editable: false }], featureFlags: { items: [], stub: true, gap } }`.

**Actions**

| Action | Endpoint | Body | Who | Step-up |
|---|---|---|---|---|
| Change a setting | `PATCH /config/settings/:key` | `{ value: { unit: "days"\|"months"\|"business_days", count: 1–3650 }, reason: 3–500, code? }` | owner **[API]** (database: any platform admin at step-up **[DB]**) | **yes** |

Success returns the updated row; toast "Setting saved"; refetch `/config`. Errors: `conflict` (setting
not editable from the portal), `validation_failed` on `value.unit` ("licence.manual_check_target uses
business_days"), `not_found`, step-up/session per 1.6.

**What an admin can achieve here** See every platform setting Casevoya runs on (trial length, licence
and source re-check intervals, upload limits, email addresses, plan allowances), change the duration
settings with a recorded reason, and see which switches are on.

**Logic and rules**

- Editable = the stored value is exactly `{unit, count}` **[API]**, because the database's setting
  function only writes that shape **[DB]**. Today that is `trial.duration`, `licence.recheck_interval`,
  `licence.manual_check_target` and `source.recheck_interval.*`. Units: `business_days` for
  `licence.manual_check_target`, `days`/`months` for the rest **[API]** (the database checks the first
  three keys **[DB]**). Count 1–3650 **[API][DB]**.
- Every other setting (switches, plans, upload limits, email addresses, Stripe prices) is read-only in
  the portal **[NOT BUILT]**; they change through reviewed migrations.
- Saving clears `pending_confirmation` **[DB]** (the flag marks defaults nobody has confirmed).
- Owner-only is a portal rule **[API]**; the database allows any platform admin with a fresh step-up.
- Side effects: new values apply at once to new work (for example, a new trial gets the new length;
  next licence review dates use the new interval on the next check). Audit: the database records
  `product.setting_changed` (not shown in Audit log, see 5), and the portal records
  `admin_portal.config.setting_changed` with `{ key, reason, before, after }` (shown).
- Feature flags (per-firm or percentage) **[NOT BUILT]**.

#### 2.8.1 Admins (Config › Admins, owners only)

**Layout** Three sections: **Admins** table (Email, Role select, Template reviewer toggle, Licensed
badge, Authenticator factors count, Last sign-in, Added by/at, **Remove**), **Invites** table (Email,
Role, Reviewer, Status: pending/expired/accepted/cancelled, Invited by/at, Expires, **Cancel**), and
**Removed** history. Button **Invite admin**.

**Data** `GET /admins` → `{ admins: [{ user_id, email, role, template_reviewer, note, created_at, created_by_email, last_sign_in_at, verified_factors, licensed }], invites: [{ id, email, role, template_reviewer, note, status, invited_by_email, invited_at, expires_at, accepted_at, cancelled_at }], removals: [{ id, user_id, email, role, removed_at, removed_by_email, reason }] }`.

**Actions** (all owner, all **step-up**)

| Action | Endpoint | Body | Confirmation |
|---|---|---|---|
| Invite | `POST /admins/invites` (201) | `{ email, role: owner\|operator\|viewer, templateReviewer: bool, note?: ≤200, days: 1–30 (default 7), code? }` | After success show `nextSteps` and `accessReady` (false = "This email is not on the portal's allow list yet") |
| Cancel invite | `POST /admins/invites/:id/cancel` | `{ reason?: ≤500, code? }` | "Cancel the invite for <email>?" |
| Change role | `PATCH /admins/:id/role` | `{ role, code? }` | "Make <email> an operator?" |
| Reviewer flag | `PATCH /admins/:id/reviewer` | `{ templateReviewer: bool, code? }` | none beyond step-up |
| Remove | `POST /admins/:id/remove` | `{ reason: 3–500, confirmEmail, code? }` | Destructive dialog; type the admin's email to confirm |

Invite success → `{ id, accessReady, nextSteps: [3 sentences] }`. Refresh `/admins` and `/session`
after every action (your own role may change).

**Logic and rules** One open invite per email; invites expire after `days` **[DB]**. **No email is
sent** **[NOT BUILT]**: tell the person, add them to the Cloudflare Access policy and to
`ADMIN_ALLOWED_EMAILS`, then deploy. The invitee needs a Casevoya account with an authenticator app
and accepts on the invite screen (3.4) **[DB: needs aal2]**. The last owner cannot be demoted or
removed **[DB]**. Removal deletes the admin row and keeps a removal record **[DB]**; it does not
remove them from Access (do that in Cloudflare). Reviewer flag alone is not enough to review: a
verified licence is also required **[DB]**. Audit: `platform_admin.*` (database) and
`admin_portal.admins.*`.

### 2.9 Audit log

**Route** `/audit` · **Roles** all · **Purpose** who did what on the platform side.

**Layout (1440)** FilterBar: Action prefix (select of families: `admin_portal.`, `platform_admin`,
`support_access.`, `service_notice.`, `template.`, `outbox.`, `licence.`, `cicc.`, `subscription.`,
`security.`, or free text), Firm (combobox → `organizationId`), Actor (admin select → `actorUserId`),
Result (success/denied/failure), From/To (date-time), Object id. Table: Time, Action, Result badge
(denied amber, failure red), Actor (email or actor type), Firm, Object (table + short id), Request id.
Row expands to show `context` (JSON, when allowed) and `diff_keys`. **Load more** at the bottom.

**Data** `GET /audit?actionPrefix=&actorUserId=&organizationId=&objectId=&result=&from=&to=&beforeAt=&beforeId=&limit=50` →
`{ items: [{ id, occurred_at, action, result, actor_type, actor_user_id, actor_email, organization_id, firm_name, object_table, object_id, request_id, context|null, diff_keys: [] }], limit, next_cursor: null|{ before_at, before_id } }`.

Paging: send `beforeAt` and `beforeId` together from `next_cursor` **[API]**; `next_cursor` null = end.
`from` must not be after `to` **[API]**. `actionPrefix` pattern `^[a-z_][a-z0-9_.]{0,80}$`.

**Actions** none (read-only; export **[NOT BUILT]**).

**States** Empty: "No audit events match." Loading more: inline skeleton rows.

**Mobile** Each event a card (time, action, result, actor); filters in a sheet.

**Polling** none; a **Refresh** button reloads from the top.

**What an admin can achieve here** Trace any platform action (support access, notices, licence
checks, template decisions, retries, admin changes, setting changes, denied attempts) to a person, a
firm, a time and a request id.

**Logic and rules**

- Families shown **[DB]**: an event is shown when the first segment of its action is one of
  `admin_portal`, `platform_admin`, `platform_admins`, `platform_admin_invites`, `support_access`,
  `support_access_requests`, `service_notice`, `service_notices`, `template`,
  `shared_template_versions`, `outbox`, `licence`, `credential_checks`, `consultant_credentials`,
  `cicc`, `subscription`, `organization_subscriptions`, `product_settings`,
  `official_source_domains`, `security`. Anything else (firm-internal matters, documents, messages,
  and the database's `product.setting_changed`) is never shown **[DB]**.
- `from` is inclusive, `to` exclusive **[DB]**. `next_cursor` is returned when the page is full; the
  last page may therefore be empty **[DB]**.
- `context` is returned only for the platform's own families (admin_portal, platform_admin,
  support_access, service_notice, template, outbox, licence, cicc); otherwise null with `diff_keys`
  listing which fields changed **[DB]**.
- Every portal mutation by a caller who passed the Access gate writes an `admin_portal.<area>.<verb>`
  row, including denied and failed attempts (`result` denied/failure, `context.error_code`) **[API]**.
  Requests stopped at the Access gate are not written (Cloudflare Access keeps its own log), and reads
  (GET) are not audited **[NOT BUILT]**. If writing that row fails, the action still succeeds
  (the database's own audit row remains) **[API]**.
- Audit rows cannot be updated, deleted or truncated (database triggers) **[DB]**.

### 2.10 Privacy

**Route** `/privacy` (tabs: **Requests**, **Breach register**) · **Roles** all (read-only) ·
**Purpose** see whether firms are answering privacy requests (PIPEDA access, correction, consent
withdrawal, deletion) on time, without seeing their content.

**Layout (1440)** StatCards from `summary`: Open, Overdue (red when > 0), Due in 5 days (amber),
Closed in 30 days, and "Open by kind" chips. FilterBar: State segmented (Open / Overdue / Due soon /
Closed / All, default Open), Firm combobox. Table: Firm, Reference, Kind, Channel, Received, Due
(effective; "extended" tag when `extended_due_on`), Days left (red negative, amber ≤ 5), Stage
(Stepper chip: Received → Identity verified → Scoped → Redacted → Reviewed → Closed), Assigned
(yes/no), Outcome, Sample tag. Row → firm page (`/firms/[id]`); there is no request detail page.
Breach register tab: StubPanel with `gap`.

**Data**

- `GET /privacy/requests?state=open|overdue|due_soon|closed|all&organizationId=&limit=50&offset=0` →
  `{ items: [{ id, organization_id, firm_name, reference, kind: access|correction|consent_withdrawal|deletion, channel, received_on, due_on, extended_due_on, effective_due_on, target_days, days_left, overdue, due_soon, stage, assigned, outcome: fulfilled|partly_fulfilled|refused|withdrawn|null, closed_at, is_sample }], total, summary: { open, overdue, due_soon, closed_30d, open_by_kind: { [kind]: n } }, due_soon_days: 5, limit, offset }`.
  `summary` covers the firm filter but not the state filter.
- `GET /privacy/breaches` → `{ items: [], total: 0, limit, offset, stub: true, gap }`.

**Actions** none. Admins cannot open, change or close a firm's privacy request **[by design]**.

**States** Empty (Open): "No open privacy requests across firms." Overdue tab empty: "Nothing overdue."

**Mobile** Cards: firm, reference, kind, days left, stage chip.

**Polling** none.

**What an admin can achieve here** Spot firms that are late or close to late on privacy requests and
reach out through support before a statutory deadline passes; see the mix of request kinds.

**Logic and rules**

- Metadata only **[DB]**: never the requester's identity, the request details or notes.
- Stage = the furthest step reached, in order received → identity_verified → scoped → redacted →
  reviewed → closed **[DB]**.
- Effective due date = `extended_due_on` if set, else `due_on` **[DB]**. Dates compare with today in
  America/Toronto **[DB]**. Overdue = open and effective due date before today; due soon = open and
  due today through today + 5 days **[DB]**. Sorted overdue first, then by due date **[DB]**.
- Breach register **[NOT BUILT]** (no table).

### 2.11 Verification

**Route** `/verification` (tabs: **Licence queue**, **CICC list**, **Firms**); credential page
`/verification/credentials/[id]` · **Roles** all read; operators record checks and import lists ·
**Purpose** prove every firm's consultants hold a valid RCIC/RISIA licence and keep firm verification
status right.

**Layout (1440)**

*Header* StatCards from `/verification/summary`: Firms by verification (unverified, pending review,
verified, restricted), Licence buckets (adverse red, needs review amber, never checked, overdue,
due ≤ 7 days), Latest CICC import (date, rows, status, "N need review").

*Licence queue tab*: segmented filter with counts (Adverse, Needs review, Never checked, Overdue,
Due, All; default Due). Table: Firm, Type (RCIC/RISIA), College ID, Status badge, Register status,
Bucket badge, Latest result, Checked, Next review, Valid until, Method, Member role. Row → credential
page.

*CICC list tab*: **Upload CSV** button (operators) and the imports table (Imported, By, Source note,
Rows, Status, Completed, SHA-256 short) with each import's "needs review" credentials beneath
(firm, licence, status, checked, reason; link to the credential).

*Firms tab*: Firms filtered by verification status (reuses `GET /firms?verification=`, see 2.2), row →
firm page with its Verification panel (`GET /firms/:id/verification`).

*Credential page*: header (firm link, type, college ID, status badge, register status, entitlement,
discipline flags, restriction detail, method, source link, declared, checked, next review, valid
until); buttons **Record manual check** (operators, step-up) and **Check against CICC list**
(operators); Checks timeline (result badge, retrieved, source host, method, register status,
reviewer email, proof locator, CICC import link); Change reports list.

**Data**

- `GET /verification/summary` → `{ firmsByVerification: { unverified, pending_review, verified, restricted }, licenceCounts: {…}, workload: {…}, latestCiccImport: <import>|null }`.
- `GET /licences/queue?kind=due|overdue|never_checked|adverse|needs_review|all&limit=50&offset=0` → `{ kind, counts: { due, overdue, never_checked, adverse, needs_review, all }, total, limit, offset, items: [{ credential_id, organization_id, firm_name, licence_type, college_id, status, register_status, bucket, latest_result, checked_at, next_review_at, valid_until, verification_method, member_role }] }`.
- `GET /licences/credentials/:id` → `{ credential: { id, organization_id, firm_name, licence_type, college_id, status, register_status, entitlement_to_practise, discipline_suspended, discipline_revoked, discipline_restricted, discipline_restriction_detail, verification_method, source_url, declared_at, checked_at, next_review_at, valid_until }, checks: [{ id, result, retrieved_at, source_host, method, register_status, reviewer_email, proof_locator, created_at, cicc_import_id }], change_reports: [{ id, created_at, … }] }`.
- `GET /licences/cicc-imports?limit=20` → `{ imports: [{ id, imported_at, imported_by_email, source_note, row_count, status, completed_at, file_sha256, needs_review: [{ credential_id, organization_id, firm_name, licence_type, college_id, credential_status, checked_at, reason }] }] }`.
- `GET /firms/:id/verification` → `{ firm: { id, display_name, verification_status }, credentials: [<credential detail>], rule: "<sentence>" }`.

**Actions**

*Record manual check* — `POST /licences/credentials/:id/checks`, operators, **step-up**. Form:

| Field | Body key | Rule |
|---|---|---|
| Register page link | `sourceUrl` | https on `register.college-ic.ca` only |
| Retrieved at | `retrievedAt` | ISO date-time, not in the future (1 min grace) |
| Register status | `registerStatus` | active / inactive |
| Entitled to practise | `entitledToPractise` | boolean |
| Suspended / Revoked / Restricted | `disciplineSuspended`, `disciplineRevoked`, `disciplineRestricted` | booleans |
| Restriction detail | `restrictionDetail` | required when Restricted, forbidden otherwise; ≤ 1000 |
| Where the proof is kept | `proofLocator` | 1–500 (screenshot/PDF location) |
| Notes | `notes` | ≤ 1000 |

Before submit show the computed result preview **[UI]** using the database order: revoked >
suspended > inactive (register inactive) > not entitled > verified. Success → `{ checkId, credential }`;
toast "Check recorded: <result>"; refresh credential page, queue, summary, firm.

*Check against CICC list* — `POST /licences/credentials/:id/cicc-check` (no body beyond id), operators.
Success `{ checkId, credential }`. `validation_failed` "no CICC list has been imported yet".

*Upload CICC list* — `POST /licences/cicc-imports`, operators. Two steps in one Dialog:
1. Pick the CSV (read as text in the browser, ≤ 8 MB), enter **Source note** (1–500) and keep
   `fileName`; optional `fileLocator` (≤ 500). Send `dryRun: true`. Show `summary`: mapped columns
   (`mapped`), extra columns kept (`keptAsFields`), rows, rows skipped without a licence number,
   statuses with counts, and `unrecognisedStatuses` in amber, plus `sha256`.
2. **Import** sends the same body with `dryRun: false`. Confirmation: "Import N rows and re-check
   every credential?". Success → `{ importId, result: { import_id, row_count, checked, verified, needs_review, adverse } }`.
   On a chunk error the message names the rows and `details.importId`; the import stays open and is
   never used; fix the file and import again.

Columns recognised (case-insensitive) **[API]**: licence number (Licence Number, License Number,
Licence #, Registration Number, College ID, Member ID), name (Name, Full Name, Licensee Name, or First
/ Last), Status, Entitlement to Practise, Class. Max 20,000 rows.

**States** Queue empty for a bucket: "Nothing in <bucket>." No imports: "No CICC list imported yet.
Licences can still be checked one by one against the register."

**Mobile** Queue as cards; the manual check form full screen with sticky submit.

**Polling** none.

**What an admin can achieve here** Work through licences that are adverse, need review, were never
checked or are due; record a register check with evidence; bulk-check every credential against the
College's list; and see why each firm is (or is not) verified.

**Logic and rules**

- Buckets (one per credential, in priority order) **[DB]**: adverse (status not_entitled, inactive,
  suspended or revoked) > needs_review (latest check result) > never_checked > overdue
  (`next_review_at` before now) > due (within 7 days) > ok. The `due` filter includes overdue.
- Manual check **[DB]**: evidence must be on the College register; needs a fresh step-up in your own
  session; result as above; `next_review_at` = retrieved at + `licence.recheck_interval` (Config); an
  adverse result queues a `licence.adverse_status` event for the firm.
- CICC list check **[DB]**: uses the latest complete import. Licence number not on the list, a name
  that does not match the consultant's profile, or an unknown status → needs_review. Otherwise the
  list status maps active → verified (not_entitled if entitlement is "no"), inactive, suspended,
  revoked. A list "verified" never overrides an adverse manual register check.
- Firm verification after every check **[DB]**: a verified licence → firm `verified`; a verified firm
  with no verified licence left and an adverse credential → `restricted`; otherwise unchanged.
  `pending_review` and moving a firm back to `unverified` are not set from the portal
  **[NOT BUILT]**.
- Audit: `admin_portal.licences.check_recorded`, `.cicc_check`, `.cicc_import` (with dry runs) plus the
  database's `licence.*` / `cicc.*` events.

### 2.12 Grants

**Route** `/grants`, detail `/grants/[id]` · **Roles** all read; operators request and cancel ·
**Purpose** time-limited, firm-approved support access to a firm's settings or one matter.

**Layout (1440)** Segmented tabs with counts: **Pending**, **Active**, **Closed** (and All). Table:
Firm, Scope, Matter id (short), Ticket, Requested by, Minutes asked, Status (effective), Approved,
Ends (countdown for active, "N min left"), Extensions, Uses. Button **Request access** (operators).
Detail page: summary card, reason, "Not included", decline reason, timeline from `history.events` and
`history.uses` (time, action, actor email), action bar.

**Data**

- `GET /support/requests?state=pending|active|closed&organizationId=&limit=50&offset=0` → `{ total, counts: { pending, active, closed }, limit, offset, items: [{ id, organization_id, firm_name, status, effective_status, state, scope, matter_id, ticket_ref, requested_by_name, requested_by_email, requested_by_user_id, reason, not_included, requested_minutes, created_at, approved_at, starts_at, ends_at, ended_at, decline_reason, extension_count, minutes_left, uses }] }`. No `state` = all.
- `GET /support/requests/:id` → `{ request: { …same columns…, effective_status, minutes_left }, firm: { id, display_name }|null, history: { events: [{ at, action, result, actor_type, actor_email }], uses: [{ at, action, object_table, actor_email }] } }`.

**Actions**

*Request access* — `POST /support/requests` (201), operators, no step-up. Form: Firm (combobox,
`organizationId`), Scope (`firm_settings` | `matter_documents` | `matter_records` | `matter_all`),
Matter id (required for matter scopes, forbidden for firm_settings), Requester name (1–120), Requester
email (optional), Ticket ref (≤ 60), Not included (≤ 500), Reason (8–1000), Minutes (15–240, default
60), checkbox "The firm's owners will be emailed and must approve" (`confirmFirmNotified: true`).
Success `{ id, status: "pending" }` → go to `/grants/[id]`. `conflict` "a support request is already
waiting for this firm"; `validation_failed` "that matter is not in the firm".

*Cancel / End early* — `POST /support/requests/:id/cancel` `{ reason: 3–500 }`, operators.
Label "Withdraw request" when pending, "End access now" when active; hidden when closed. Success
returns `{ id, status, ended_at, decline_reason }`. `validation_failed` "that request is
already closed".

**States** Pending empty: "No requests waiting for a firm." Active empty: "No one has support access
right now."

**Mobile** Cards; countdown prominent; actions in a bottom sheet.

**Polling** list and detail every 30 s while any row is pending or active, else 120 s.

**What an admin can achieve here** Ask a firm for narrowly scoped, time-boxed access to help with a
ticket, see when the firm approves, declines or ends it, see each use, and end access early.

**Logic and rules**

- Lifecycle **[DB]**: `pending` → `approved` (firm owner approves in Casevoya; starts now, ends after
  the minutes) | `declined` (owner, with reason) | `cancelled` (admin withdraws). `approved` →
  `ended` (owner or admin ends early) | `expired` (the 5-minute expiry job, or effectively expired once
  `ends_at` passes; the API shows `effective_status: "expired"` before the job runs). Owners may extend
  by 30 minutes up to 240 in total **[DB]**; admins cannot extend **[NOT BUILT]**.
- Tabs: pending = status pending; active = approved, not ended, `ends_at` in the future; closed =
  everything else **[DB]**.
- One pending request per firm **[DB]**. The requester must be a platform admin **[DB]**. The matter
  must belong to the firm **[DB]**.
- Side effect of a request: Casevoya emails the firm's owners (support access request) **[DB]**.
- Using the access: the database has support read functions, but the portal does not expose a way to
  view a firm's data **[NOT BUILT]**; uses listed come from Casevoya.
- Audit: `admin_portal.support.request_created` / `.request_cancelled` plus `support_access.*`.

### 2.13 Sample mode

**Route** `/sample-mode` · **Roles** all (read-only) · **Purpose** see which firms are trying Casevoya
with demo data and whether any firm mixes demo and real matters.

**Layout (1440)** StatCards: Firms in sample mode, Proof complete, Mixed (amber when > 0). Table:
Firm (link), Sample mode (On/Off), Sample matters, Real matters, Sample privacy requests, Sample
migration batches, Sample AI runs, Proof steps (six dots: intake, agreement, upload, reminder,
invoice, export; filled when done), Proof complete, Mixed tag.

**Data** `GET /sample-mode?limit=100&offset=0` → `{ items: [{ organization_id, display_name, slug, sample_mode, sample_matters, real_matters, sample_privacy_requests, sample_migration_batches, sample_ai_runs, proof_steps_done: [], proof_complete, mixed }], total, summary: { firms_in_sample_mode, firms_total, proof_complete, mixed }, proof_steps: ["intake","agreement","upload","reminder","invoice","export"], limit, offset }`.

**Actions** none: firm owners turn sample mode on or off and clear sample data in Casevoya
**[NOT BUILT in portal, by design]**.

**States** Empty: "No firm is using sample data."

**Mobile** Cards with the six-dot proof row.

**Polling** none.

**What an admin can achieve here** Follow trial firms through the six proof steps, and catch firms
that hold sample and real matters together (a data hygiene risk) to contact them.

**Logic and rules** Listed firms: sample mode on, or any sample matters, privacy requests, migration
batches or AI runs **[DB]**. Mixed = at least one sample and one real matter **[DB]**. Proof complete =
all six steps done **[DB]**. Order: sample mode first, then name **[DB]**.

### 2.14 Migration

**Route** `/migration` · **Roles** all (read-only) · **Purpose** watch firms' data import jobs.

**Layout (1440)** StatCards: Active (staged + checked + committing), Stuck (red when > 0), Purge due,
and by-status chips. FilterBar: Status (staged, checked, committing, committed, rolled_back,
discarded, stuck), Firm. Table: Firm, Kind, Source system, Status badge (Stuck red overrides),
Size, Rows (source → staged), Attachments (files, bytes), Exceptions, Pilot (size, started, signed
off), Commit (started, committed, verified), Rolled back / Discarded, Purge after (amber when due),
Updated, Sample tag. Row expands to plan/result/pilot counts (key-value lists).

**Data** `GET /migration/jobs?status=&organizationId=&limit=50&offset=0` → `{ items: [{ id, organization_id, firm_name, kind, source_system, status, is_sample, byte_size, source_row_count, staged_row_count, attachment_files, attachment_bytes, plan_counts, result_counts, pilot_counts, exception_count, pilot_size, verified_at, checked_at, pilot_started_at, pilot_completed_at, pilot_signed_off_at, full_run_started_at, commit_started_at, committed_at, commit_verified_at, rolled_back_at, discarded_at, purge_after, staging_purged_at, stuck, purge_due, created_at, updated_at }], total, summary: { by_status, stuck, purge_due, active }, stuck_after_minutes: 30, limit, offset }`.

**Actions** none: firms stage, check, pilot, commit, roll back and discard in Casevoya
**[NOT BUILT in portal, by design]**.

**States** Empty: "No import jobs." Filter `stuck` empty: "No stuck imports."

**Mobile** Cards: firm, status, rows, stuck/purge tags.

**Polling** 60 s while `summary.active > 0`.

**What an admin can achieve here** See imports in flight, find ones stuck mid-commit to help the firm,
and check that staged copies are purged on time.

**Logic and rules** Stuck = committing and the commit (or full run, or last update) started more than
30 minutes ago **[DB]**. Purge due = staging not purged and `purge_after` passed **[DB]**; a daily job
purges expired staging **[DB]**, so a lasting purge-due flag means that job is failing. No file names
or row content **[DB]**. Sorted stuck first, then most recently updated **[DB]**.

## 3 Session screens

These run under the Access gate only (the invitee gate): they work for admins and for people holding
an open invite.

### 3.1 How the two sign-ins fit

1. **Cloudflare Access** (Google/one-time PIN, outside the app) protects every URL. Without it the
   browser gets a 302 to Access; the API returns `401 unauthenticated`. The UI never sees this unless
   Access expires mid-session: on `401 unauthenticated` do a full-page reload (Access takes over).
2. **Own Casevoya session**: a password + authenticator sign-in as the same person, kept by the server
   in an httpOnly cookie for at most 1 hour. Needed for every action that runs as the admin in the
   database (step-up actions, accept invite). Reads do not need it.

Session chip (top bar, from `/session.session`): "Not signed in" (button Sign in) → "Signed in ·
MFA" → "Fresh MFA · 12 min" countdown to `stepUpFreshUntil` → back to "Signed in · MFA" when it
lapses. `matchesAccessUser: false` → red chip "Session belongs to someone else", Sign out button.

### 3.2 Sign-in dialog

Fields: Password (1–200), Authenticator code (6 digits, `code`). Email shown read-only (the Access
email; it cannot be changed). `POST /session/sign-in { password, code }` → `{ session: SessionStatus }`.
Errors: `validation_failed` with issue path `password` ("Email or password was not accepted.") or
`code` ("That authenticator code was not accepted."); `forbidden` "Your account has no verified
authenticator app. Set one up in Casevoya first (Settings › Security)." (show a link to Casevoya);
`session_required` "That Supabase user is not the user behind your Access sign-in." On success:
refetch `/session`, close, and retry the request that opened the dialog once. A fresh sign-in also
counts as a step-up for 15 minutes. Hidden when `capabilities.signInAvailable` is false.

### 3.3 Step-up dialog

One field: code. `POST /session/step-up { code }` → `{ session }`. Needs a session (else
`session_required` → open 3.2 instead). Alternative: forms with step-up may include the code inline
as `code` in their own body (the API verifies it first). Show the dialog when a request returns
`step_up_required`, or pre-emptively when `stepUpFreshUntil` is under 5 seconds away (UI hint only).

**Sign out**: `POST /session/sign-out` (no body) → `{ signedOut: true }`; ends only the own session,
not Access. Menu item in the account menu.

### 3.4 Invite accept

Shown when `/session.role` is null and `invite` is set (`GET /session/invite` returns
`{ invite: { id, role, template_reviewer, expires_at, invited_at }, alreadyAdmin }`). Card: "You've
been invited as <role> (template reviewer: yes/no). Expires <date>." Steps: 1. Sign in (3.2). 2.
Checkbox "I accept the platform admin role" → `POST /session/accept-invite { confirm: true }` →
`{ accepted, invite_id, role, … }`, then reload into Overview. Errors: `step_up_required`/`forbidden`
"sign in with MFA to accept", "confirm your email first", "no open invite for your email" (expired or
cancelled; ask an owner), `conflict` "You are already a platform admin".

### 3.5 No access

When `/session` returns `403 forbidden`: full-page message using `error.message` ("No Casevoya user
exists for this email yet" / "This user is not a platform admin and has no open invite" / not on the
allow list), plus the Access email and a "Sign out of Access" link (`/cdn-cgi/access/logout`). `500
internal` or `502 upstream_error` from the gate: "The portal can't check your access right now" with
retry and the request id.

### 3.6 Setup (first admin, `/setup`)

Design: HANDOFF "Setup (first admin)", screenshots `additions/setup-*`. Shown only while
`platform_admins` is empty; the AdminApp does not load `/session` on `/setup`. Centred card (456 px), the
brand line, three progress bars (account, authenticator, finish), title, lede, fields, three check lines
and one full-width primary button. Busy buttons show a spinner inside the button's flex gap (no overlap at
390 px).

- **Loading** (`GET /setup` pending): skeleton card. **Error** (5xx/network): "We couldn't check setup",
  red alert "The server didn't answer · Request <id>. No account was created. Try again in a moment.",
  **Try again**. **Locked** (`409`, `details.locked`): pill "Setup is locked", "This step is already
  done", the date from `details.lockedAt`, rows Created through / Logged, "Need another admin? Ask an
  existing owner to invite you from Config › Admins." and **Sign in to admin** (`/`).
- `GET /setup` → `{ state: "open", email, step: "account"|"authenticator"|"finish", account: { exists,
  fullName }, authenticator: { verified, pending }, passwordMinLength: 12, signInAvailable }`.
- **Step 1, account.** Full name, Work email (read-only, from Access), Password ("At least 12
  characters"). Button "Create owner account" (no account yet) or "Continue" (account exists).
  `POST /setup/account { fullName, password }`. `422` on `password` with `details.canReset` → warn alert
  "Forgot this account's password?" + **Set a new password**, which switches the card to "Set a new
  password" with a confirm checkbox → `POST /setup/password { fullName, password, confirm: true }`.
  With `details.unconfirmed` (existing account whose email was never confirmed) the alert reads "This
  account's email was never confirmed"; only the new-password path continues.
- **Step 2, authenticator.** On entry `POST /setup/authenticator {}` → `{ mode: "new", factorId, qrCode,
  secret, uri }` (QR image + grouped manual key), `{ mode: "pending" }` (already scanned: just enter the
  code, link "Show a new QR code" → `{ restart: true }`) or `{ mode: "existing" }`. Code input →
  `POST /setup/authenticator/verify { code }`; `422` on `code` shows under the field. "Passkeys: coming
  later." `401 session_required` returns to step 1.
- **Step 3, finish.** Checkbox "I'm the platform owner and want to finish setup" → `POST /setup/finish
  { confirm: true }` → "You're the owner", then `router.replace("/")` (Overview).
- `429 rate_limited` (5 bad passwords/codes in 15 minutes) shows the server message.

## 4 Walkthroughs

### 4.1 First-admin bootstrap

Pages: 3.6 Setup → Overview. Endpoints: `/session`, `/setup*`. Details and the script fallback:
docs/BOOTSTRAP.md.

1. The email must be on the Access policy and in `ADMIN_ALLOWED_EMAILS` (already the case for
   admin@casevoya.ca).
2. Francis opens https://admin.casevoya.ca and passes Access. `/session` → 403, `GET /setup` → 200, so
   the portal goes to `/setup`.
3. Step 1: name + password (existing account: its password, or set a new one). Step 2: scan the QR,
   enter the code. Step 3: Finish → `bootstrap_first_platform_admin` inserts the **owner** and audits
   `platform_admin.bootstrapped` **[DB]**.
4. Overview loads with `role: "owner"`; the session from Setup is already signed in (aal2).
5. `/setup` is locked from now on (409). Next: Config › Admins to invite others (each invitee: Access
   policy + `ADMIN_ALLOWED_EMAILS` + deploy, then 3.4).

### 4.2 Licence check

Pages: Verification (queue) → credential page → Firms. Endpoints: `GET /licences/queue`,
`GET /licences/credentials/:id`, `POST /session/step-up`, `POST /licences/credentials/:id/checks`,
`GET /firms/:id/verification`.

1. Open Verification, bucket **Due** (or Never checked / Adverse). Pick a credential.
2. Open the College register (link out) and find the licence; save a screenshot/PDF somewhere and note
   where.
3. **Record manual check**: paste the register URL, retrieved time, status, entitlement, discipline
   flags (restriction detail if restricted), proof location. Step-up if asked.
4. Result appears in the timeline; next review = retrieved + recheck interval. If adverse, the firm is
   notified through Casevoya's event and may become **restricted**; if verified, the firm becomes
   **verified**. Open the firm's Verification panel to confirm.
5. Bulk alternative: Verification › CICC list › Upload CSV (dry run, then Import); then work the
   **Needs review** bucket by hand.

### 4.3 Support grant lifecycle

Pages: Grants → grant detail. Endpoints: `POST /support/requests`, `GET /support/requests`,
`GET /support/requests/:id`, `POST /support/requests/:id/cancel`.

1. Grants › **Request access**: firm, scope (matter id for matter scopes), reason, minutes, ticket;
   tick the notice box. Result: **Pending**; the firm's owners get an email.
2. The firm owner approves (or declines with a reason) in Casevoya. The list (polling every 30 s)
   moves it to **Active** with a countdown; the owner may extend by 30 min up to 240.
3. Work the ticket in Casevoya under the granted scope (uses appear in the timeline). Viewing firm
   data from the portal is **[NOT BUILT]**.
4. Finish: **End access now** with a reason, or let it expire (expiry job every 5 minutes; shown as
   expired immediately). It moves to **Closed**.
5. Withdraw a pending request the same way (status cancelled).

### 4.4 Posting and resolving a notice

Pages: Incidents (Notices tab) → Overview (status). Endpoints: `POST /notices`, `GET /incidents`,
`PATCH /notices/:id`, `POST /notices/:id/resolve`, `GET /overview`.

1. Incidents › **Post notice** (see 2.6): kind, severity, audience (all firms or listed firms),
   title, body, window. Publish now or save as draft; a future start shows as **Scheduled**.
2. While its window covers now it is **Live**: staff of the targeted firms see the Casevoya banner,
   and Overview's status shows major_incident / incident / maintenance.
3. Update text or window with **Edit** while not resolved.
4. **Resolve** with a resolution note (published notices only). It becomes read-only (`409` on edit),
   Overview returns to operational when no other live notice remains. No email is sent at any step.

### 4.5 Retrying a dead letter

Pages: Health → dead-letter detail. Endpoints: `GET /health`, `GET /health/dead-letters`,
`GET /health/dead-letters/:id`, `POST /health/dead-letters/:id/retry`.

1. Health shows **Unhealthy** (any dead letter). Open Dead letters, read the error and attempts.
2. Fix the cause first (for example a provider outage or bad configuration).
3. **Retry** with a reason and confirmation; step-up if asked. The event goes back to pending with
   attempts reset and the outbox worker picks it up on its next run.
4. Health refreshes (30 s); the queue returns to healthy when no dead letters remain. Bulk retry and
   discard are **[NOT BUILT]**.

### 4.6 Template draft → review → publish → rollback

Pages: Releases (Templates tab) → version page → Releases (Template releases tab). Endpoints:
`GET /templates`, `POST /templates/drafts`, `PATCH /templates/versions/:id`,
`GET /templates/versions/:id`, `POST /templates/versions/:id/approve|reject|rollback`,
`GET /releases/templates`, `GET /templates/history/:key`.

1. Author (operator) clicks **New draft**: key, title, summary, items, test evidence, effective date,
   changelog, sources (at least one official). One open draft per template.
2. Author revises as needed (only the author can).
3. Reviewer (another admin: operator/owner, reviewer flag, verified licence) opens the version page,
   compares the diff and sources, ticks "I compared…", enters a code, **Approve and publish**. The
   old version becomes superseded; adopting firms get a notice in Casevoya. Or **Reject** with a
   reason (the draft is closed; write a new one).
4. If the release is wrong: **Roll back** with a reason (reviewer, step-up). The release becomes
   rolled back and the previous version is published again; firms are notified.
5. Template releases tab and history show every step with reviewer and dates.

## 5 Gaps (not built)

Each item below is shown in the UI as described (stub, read-only note, or nothing) and is not
enforced or provided by the backend today.

| # | Gap | Where it shows | Today |
|---|---|---|---|
| 1 | App release notes | Releases › App release notes | `GET /releases/app-notes` stub, always empty |
| 2 | Feature flags | Config › Feature flags | `featureFlags` stub in `GET /config` |
| 3 | Breach register | Privacy › Breach register | `GET /privacy/breaches` stub |
| 4 | Separate incidents / postmortems | Incidents | Incidents are service notices; no incident table, timeline or postmortem |
| 5 | Deleting or unpublishing notices | Incidents | Only edit (until resolved) and resolve |
| 6 | Admin-side grant extension; viewing a firm's data from the portal | Grants | Owners extend in Casevoya; database read functions exist but the portal has no endpoint |
| 7 | Invite emails | Config › Admins | No email sent; tell the person, add them to Access and `ADMIN_ALLOWED_EMAILS`, deploy |
| 8 | Rate limiting on the API | all | Relies on Access and step-up |
| 9 | Bulk retry / discard of dead letters | Health | One at a time |
| 10 | Billing actions, limit overrides, plan changes | Subscriptions, Usage | Read-only (Stripe and the firm handle billing) |
| 11 | AI usage against plan | Usage | No AI limit in plans; AI shown as counts only (see 2.4) |
| 12 | Editing settings that are not `{unit, count}` and switches | Config | Read-only |
| 13 | `product.setting_changed` in Audit log | Audit log | Not in the families; the portal's own `admin_portal.config.setting_changed` row is shown |
| 14 | Recording support SLA records | Overview | Read-only counts |
| 15 | Sample mode and migration actions | Sample mode, Migration | Firm-owned, by design |
| 16 | Firm verification `pending_review` / manual reset | Verification | Only set by licence checks |
| 17 | Auditing reads (GET) and Access-gate refusals | Audit log | Mutations only; Access keeps its own log |
| 18 | Audit export | Audit log | None |

## 6 Endpoint index

Base `/api/admin`. Roles: **all** = owner/operator/viewer; **ops** = owner/operator; **own** = owner.
Session: **—** none; **req** own session; **up** fresh step-up (or `code` in body). Audit = portal
action (prefixed `admin_portal.`; mutations only).

| Method | Path | Roles | Session | Audit | Page |
|---|---|---|---|---|---|
| GET | /setup | setup gate | — | — | 3.6 |
| POST | /setup/account | setup gate | — | setup.account | 3.6 |
| POST | /setup/password | setup gate | — | setup.password_reset | 3.6 |
| POST | /setup/authenticator | setup gate | own (aal1) | setup.authenticator_started | 3.6 |
| POST | /setup/authenticator/verify | setup gate | own (aal1) | setup.authenticator_verified | 3.6 |
| POST | /setup/finish | setup gate | own (aal2) | setup.finished | 3.6 |
| GET | /session | invitee gate | — | — | global |
| POST | /session/sign-in | invitee gate | — | session.sign_in | 3.2 |
| POST | /session/step-up | invitee gate | req | session.step_up | 3.3 |
| POST | /session/sign-out | invitee gate | — | session.sign_out | 3.3 |
| GET | /session/invite | invitee gate | — | — | 3.4 |
| POST | /session/accept-invite | invitee gate | req (aal2 in DB) | admins.invite_accepted | 3.4 |
| GET | /overview | all | — | — | Overview |
| GET | /overview/support-sla | all | — | — | Overview |
| GET | /overview/complaints | all | — | — | Overview |
| GET | /firms | all | — | — | Firms |
| GET | /firms/:id | all | — | — | Firms |
| GET | /firms/:id/verification | all | — | — | Firms, Verification |
| GET | /subscriptions/exceptions | all | — | — | Subscriptions |
| GET | /usage | all | — | — | Usage |
| GET | /health | all | — | — | Health |
| GET | /health/dead-letters | all | — | — | Health |
| GET | /health/dead-letters/:id | all | — | — | Health |
| POST | /health/dead-letters/:id/retry | ops | up | health.replay | Health |
| GET | /incidents | all | — | — | Incidents |
| GET | /notices | all | — | — | Incidents |
| GET | /notices/:id | all | — | — | Incidents |
| POST | /notices | ops | — | notices.posted | Incidents |
| PATCH | /notices/:id | ops | — | notices.updated | Incidents |
| POST | /notices/:id/resolve | ops | — | notices.resolved | Incidents |
| GET | /releases/templates | all | — | — | Releases |
| GET | /releases/app-notes | all | — | — (stub) | Releases |
| GET | /templates | all | — | — | Releases |
| GET | /templates/official-domains | all | — | — | Releases |
| GET | /templates/history/:key | all | — | — | Releases |
| GET | /templates/versions/:id | all | — | — | Releases |
| POST | /templates/drafts | ops | — | templates.draft_created | Releases |
| PATCH | /templates/versions/:id | ops (author) | — | templates.draft_revised | Releases |
| POST | /templates/versions/:id/approve | ops + reviewer | up | templates.approve | Releases |
| POST | /templates/versions/:id/reject | ops + reviewer | up | templates.reject | Releases |
| POST | /templates/versions/:id/rollback | ops + reviewer | up | templates.rollback | Releases |
| GET | /config | all | — | — | Config |
| PATCH | /config/settings/:key | own | up | config.setting_changed | Config |
| GET | /admins | own | — | — | Config › Admins |
| POST | /admins/invites | own | up | admins.invited | Config › Admins |
| POST | /admins/invites/:id/cancel | own | up | admins.invite_cancelled | Config › Admins |
| PATCH | /admins/:id/role | own | up | admins.role_changed | Config › Admins |
| PATCH | /admins/:id/reviewer | own | up | admins.reviewer_changed | Config › Admins |
| POST | /admins/:id/remove | own | up | admins.removed | Config › Admins |
| GET | /audit | all | — | — | Audit log |
| GET | /privacy/requests | all | — | — | Privacy |
| GET | /privacy/breaches | all | — | — (stub) | Privacy |
| GET | /verification/summary | all | — | — | Verification |
| GET | /licences/queue | all | — | — | Verification |
| GET | /licences/credentials/:id | all | — | — | Verification |
| POST | /licences/credentials/:id/checks | ops | up | licences.check_recorded | Verification |
| POST | /licences/credentials/:id/cicc-check | ops | up | licences.cicc_check | Verification |
| GET | /licences/cicc-imports | all | — | — | Verification |
| POST | /licences/cicc-imports | ops | up (not for dry runs) | licences.cicc_import | Verification |
| GET | /support/requests | all | — | — | Grants |
| GET | /support/requests/:id | all | — | — | Grants |
| POST | /support/requests | ops | — | support.request_created | Grants |
| POST | /support/requests/:id/cancel | ops | — | support.request_cancelled | Grants |
| GET | /sample-mode | all | — | — | Sample mode |
| GET | /migration/jobs | all | — | — | Migration |

Database audit actions the UI may show (Audit log): `platform_admin.*` (bootstrapped, invited,
invite_accepted, role changes, removal), `support_access.*`, `service_notice.*`, `template.*`
(version_published, version_rejected, …), `outbox.replay`, `licence.*`, `cicc.*`, `security.*`.
