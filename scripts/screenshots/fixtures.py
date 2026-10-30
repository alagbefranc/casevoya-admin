"""Fictional fixture responses for the local screenshot run (scripts/screenshots/shoot.py).

Nothing here is real client data: firm names, ids, emails and licence numbers are invented. The app
never loads this file; Playwright answers /api/admin/* requests with it in the test browser only.
"""
from datetime import datetime, timedelta, timezone

NOW = datetime.now(timezone.utc).replace(microsecond=0)


def iso(minutes=0, days=0):
    return (NOW + timedelta(minutes=minutes, days=days)).isoformat().replace("+00:00", "Z")


def unix(minutes=0):
    return int((NOW + timedelta(minutes=minutes)).timestamp())


def uid(n):
    return f"00000000-0000-4000-8000-{n:012d}"


ME = {
    "email": "jordan@example.test",
    "userId": uid(900),
    "role": "owner",
    "templateReviewer": True,
    "licensed": True,
    "verifiedFactors": 1,
    "invite": None,
    "session": {"signedIn": True, "userId": uid(900), "aal": "aal2", "expiresAt": unix(50), "stepUpAt": unix(-3), "stepUpFreshUntil": unix(12), "matchesAccessUser": True},
    "capabilities": {"read": True, "operate": True, "manageAdmins": True, "reviewTemplates": True, "acceptInvite": False, "signInAvailable": True},
    "environment": {"supabaseUrl": "https://example.supabase.co", "adminOrigin": "http://127.0.0.1:3100"},
}

OVERVIEW = {
    "firms": {"total": 6, "live": 5, "sample": 1, "by_verification": {"verified": 4, "pending_review": 1, "restricted": 1}},
    "subscriptions": {"exceptions": 4, "by_reason": {"past_due": 1, "invoice_unpaid": 1, "restricted": 1, "trial_ending": 1, "cancel_scheduled": 1}, "by_status": {"active": 3, "trial": 1, "past_due": 1, "restricted": 1}},
    "queues": {"level": "unhealthy", "counts": {"pending": 12, "processing": 1, "published": 812, "failed": 0, "dead_lettered": 2}, "oldest_pending_wait_seconds": 40, "processing_stuck": 0, "failed_last_hour": 0},
    "licences": {"due": 2, "overdue": 0, "never_checked": 0, "adverse": 0, "needs_review": 1, "all": 12},
    "verification_workload": {"firms_pending_review": 1, "firms_unverified": 0, "credentials_needing_review": 1, "credentials_never_checked": 0},
    "incidents": {"active": 0, "active_incidents": 0, "worst_severity": None, "status": "operational"},
    "support": {"pending": 1, "active": 1},
    "templates": {"awaiting_review": 1, "published": 4},
    "complaints": {"open": 3, "ack_overdue": 1, "response_overdue": 0, "total": 9},
    "generated_at": iso(),
}

FIRMS = [
    {"id": uid(1), "display_name": "Maple Pathways", "legal_name": "Maple Pathways Consulting", "slug": "maple-pathways", "verification_status": "pending_review", "sample_mode": True, "created_at": iso(days=-5), "subscription_status": "trial", "plan": "solo", "billing_interval": "month", "trial_ends_at": iso(days=2), "current_period_end": None, "exception_reasons": ["trial_ending"], "active_members": 1},
    {"id": uid(2), "display_name": "Fraser Consulting", "legal_name": "Fraser Immigration Consulting Corp.", "slug": "fraser", "verification_status": "verified", "sample_mode": False, "created_at": iso(days=-44), "subscription_status": "active", "plan": "solo", "billing_interval": "month", "trial_ends_at": None, "current_period_end": iso(days=16), "exception_reasons": ["cancel_scheduled"], "active_members": 2},
    {"id": uid(3), "display_name": "Old Town Immigration", "legal_name": "Old Town Immigration Consulting Inc.", "slug": "old-town", "verification_status": "restricted", "sample_mode": False, "created_at": iso(days=-204), "subscription_status": "restricted", "plan": "solo", "billing_interval": "month", "trial_ends_at": None, "current_period_end": None, "exception_reasons": ["restricted"], "active_members": 1},
    {"id": uid(4), "display_name": "Northline Immigration", "legal_name": "Northline Immigration Services Inc.", "slug": "northline", "verification_status": "verified", "sample_mode": False, "created_at": iso(days=-231), "subscription_status": "active", "plan": "practice", "billing_interval": "year", "trial_ends_at": None, "current_period_end": iso(days=120), "exception_reasons": [], "active_members": 6},
    {"id": uid(5), "display_name": "Harbourview Legal", "legal_name": "Harbourview Legal LLP", "slug": "harbourview", "verification_status": "verified", "sample_mode": False, "created_at": iso(days=-268), "subscription_status": "active", "plan": "firm", "billing_interval": "year", "trial_ends_at": None, "current_period_end": iso(days=98), "exception_reasons": [], "active_members": 18},
    {"id": uid(6), "display_name": "Lakeside Visa Services", "legal_name": "Lakeside Visa Services Ltd.", "slug": "lakeside", "verification_status": "verified", "sample_mode": False, "created_at": iso(days=-281), "subscription_status": "past_due", "plan": "practice", "billing_interval": "month", "trial_ends_at": None, "current_period_end": iso(days=1), "exception_reasons": ["past_due", "invoice_unpaid"], "active_members": 4},
]


def page(items, total=None, **extra):
    return {"items": items, "total": len(items) if total is None else total, "limit": 50, "offset": 0, **extra}


GRANTS = [
    {"id": uid(301), "organization_id": uid(6), "firm_name": "Lakeside Visa Services", "status": "pending", "effective_status": "pending", "state": "pending", "scope": "matter_documents", "matter_id": uid(7001), "ticket_ref": "SUP-4471", "requested_by_name": "Kenji Ito", "requested_by_email": "kenji@example.test", "requested_by_user_id": uid(901), "reason": "Client cannot see uploaded passport scan in the matter checklist.", "not_included": "Messages and notes", "requested_minutes": 60, "created_at": iso(minutes=-25), "approved_at": None, "starts_at": None, "ends_at": None, "ended_at": None, "decline_reason": None, "extension_count": 0, "minutes_left": None, "uses": 0},
    {"id": uid(302), "organization_id": uid(4), "firm_name": "Northline Immigration", "status": "approved", "effective_status": "approved", "state": "active", "scope": "firm_settings", "matter_id": None, "ticket_ref": "SUP-4466", "requested_by_name": "Mina Haddad", "requested_by_email": "mina@example.test", "requested_by_user_id": uid(902), "reason": "Owner asked us to check why invoice reminders stopped.", "not_included": None, "requested_minutes": 60, "created_at": iso(minutes=-80), "approved_at": iso(minutes=-34), "starts_at": iso(minutes=-34), "ends_at": iso(minutes=26), "ended_at": None, "decline_reason": None, "extension_count": 0, "minutes_left": 26, "uses": 3},
]


def grants(state=None):
    items = [g for g in GRANTS if state is None or g["state"] == state]
    return page(items, counts={"pending": 1, "active": 1, "closed": 7})


FIRM_DETAIL = {
    "firm": {"id": uid(6), "display_name": "Lakeside Visa Services", "legal_name": "Lakeside Visa Services Ltd.", "slug": "lakeside", "verification_status": "verified", "sample_mode": False, "created_at": iso(days=-281), "timezone": "America/Toronto", "default_locale": "en-CA", "jurisdiction_codes": ["CA-ON"], "dpa_accepted_at": iso(days=-281), "dpa_version": "2026-01", "subscription_terms_accepted_at": iso(days=-281), "subscription_terms_version": "2026-01"},
    "subscription": {"status": "past_due", "plan": "practice", "billing_interval": "month", "extra_seats": 0, "trial_started_at": None, "trial_ends_at": None, "current_period_end": iso(days=1), "cancel_at": None, "cancelled_at": None, "past_due_since": iso(days=-6), "restricted_at": None, "archived_at": None, "latest_invoice_status": "open", "stripe_customer_id": "cus_EXAMPLE123", "stripe_subscription_id": "sub_EXAMPLE123", "exception_reasons": ["past_due", "invoice_unpaid"], "updated_at": iso(days=-6)},
    "subscription_events": [{"kind": "invoice.payment_failed", "occurred_at": iso(days=-6), "stripe_event_id": "evt_EXAMPLE2"}, {"kind": "invoice.paid", "occurred_at": iso(days=-36), "stripe_event_id": "evt_EXAMPLE1"}],
    "invoices": [{"id": "in_EXAMPLE0002", "status": "open", "amount_due_cents": 14900, "amount_paid_cents": 0, "currency": "cad", "created_at": iso(days=-28)}, {"id": "in_EXAMPLE0001", "status": "paid", "amount_due_cents": 14900, "amount_paid_cents": 14900, "currency": "cad", "created_at": iso(days=-58)}],
    "members": {"active": 4, "invited": 1, "suspended": 0, "by_role": {"firm_owner": 1, "licensed_consultant": 1, "staff": 2}},
    "credentials": [{"id": uid(501), "licence_type": "rcic", "college_id": "R700001", "status": "verified", "register_status": "active", "checked_at": iso(days=-40), "next_review_at": iso(days=50)}],
    "support_requests": [{"id": uid(301), "status": "pending", "scope": "matter_documents", "ticket_ref": "SUP-4471", "created_at": iso(minutes=-25), "ends_at": None, "open": True}],
    "complaints": {"open": 1, "ack_overdue": 1, "response_overdue": 0, "total": 3},
    "outbox": {"pending": 2, "failed": 0, "dead_lettered": 1},
}

SLA = {"days": 30, "target_minutes": 1440, "received": 24, "responded": 23, "awaiting_response": 1, "awaiting_over_target": 0, "within_target": 23, "breached": 1, "median_minutes": 38}
COMPLAINTS = {"totals": {"open": 3, "ack_overdue": 1, "response_overdue": 0, "total": 9}, "by_category": {"service": 2, "fees": 1}, "by_firm": [{"organization_id": uid(6), "firm_name": "Lakeside Visa Services", "open": 1, "ack_overdue": 1, "response_overdue": 0}, {"organization_id": uid(2), "firm_name": "Fraser Consulting", "open": 2, "ack_overdue": 0, "response_overdue": 0}]}


def base_routes():
    """Path (without /api/admin) → payload. Paths may carry a query string; the longest prefix wins."""
    return {
        "/session": ME,
        "/overview/support-sla": SLA,
        "/overview/complaints": COMPLAINTS,
        "/overview": OVERVIEW,
        "/firms?limit=5": page(FIRMS[:5], total=6),
        f"/firms/{uid(6)}/verification": {"firm": {"id": uid(6), "display_name": "Lakeside Visa Services", "verification_status": "verified"}, "credentials": [], "rule": "After every licence check the firm becomes verified if it has a verified licence."},
        f"/firms/{uid(6)}": FIRM_DETAIL,
        "/firms": page(FIRMS),
        "/support/requests?state=active": grants("active"),
        "/support/requests?state=pending": grants("pending"),
        "/support/requests": grants(),
    }


# ---------------------------------------------------------------- PR 2: health, grants, incidents, releases

HEALTH = {
    "level": "unhealthy", "counts": {"pending": 12, "processing": 1, "published": 812, "failed": 0, "dead_lettered": 2},
    "oldest_pending_at": iso(minutes=-1), "oldest_pending_wait_seconds": 40, "processing_stuck": 0, "failed_last_hour": 0,
    "dead_letters_by_type": [{"event_type": "notification.email.send", "count": 1}, {"event_type": "stripe.webhook.invoice_payment_failed", "count": 1}],
    "thresholds": {"degraded_wait_seconds": 600, "unhealthy_wait_seconds": 3600, "stuck_processing_minutes": 15}, "checked_at": iso(),
}
HEALTH_OK = {**HEALTH, "level": "healthy", "counts": {**HEALTH["counts"], "dead_lettered": 0}, "dead_letters_by_type": []}
DEAD = [
    {"id": uid(801), "event_type": "notification.email.send", "aggregate_type": "notification", "organization_id": uid(4), "firm_name": "Northline Immigration", "attempts": 8, "occurred_at": iso(minutes=-81), "available_at": iso(minutes=-20), "last_error": "smtp 554: mailbox unavailable (recipient rejected)"},
    {"id": uid(802), "event_type": "stripe.webhook.invoice_payment_failed", "aggregate_type": "subscription", "organization_id": uid(6), "firm_name": "Lakeside Visa Services", "attempts": 8, "occurred_at": iso(minutes=-290), "available_at": iso(minutes=-200), "last_error": "upstream timeout after 30000 ms"},
]
DEAD_DETAIL = {**DEAD[0], "status": "dead_lettered", "schema_version": 1, "aggregate_id": uid(8801), "locked_at": None, "published_at": None, "payload_keys": ["template", "recipient_role", "matter_ref"], "payload_bytes": 412, "replays": []}

CLOSED_GRANT = {**GRANTS[0], "id": uid(303), "organization_id": uid(2), "firm_name": "Fraser Consulting", "status": "declined", "effective_status": "declined", "state": "closed", "ticket_ref": "SUP-4410", "decline_reason": "We fixed it ourselves.", "created_at": iso(days=-3)}
GRANT_DETAIL = {
    "request": GRANTS[1], "firm": {"id": uid(4), "display_name": "Northline Immigration"},
    "history": {
        "events": [
            {"at": iso(minutes=-80), "action": "admin_portal.support.request_created", "result": "success", "actor_type": "platform_admin", "actor_email": "mina@example.test"},
            {"at": iso(minutes=-79), "action": "support_access.owners_emailed", "result": "success", "actor_type": "system", "actor_email": None},
            {"at": iso(minutes=-34), "action": "support_access.approved", "result": "success", "actor_type": "firm_owner", "actor_email": "owner@northline.example"},
        ],
        "uses": [{"at": iso(minutes=-25), "action": "viewed_firm_settings", "object_table": "organizations", "actor_email": "mina@example.test"}],
    },
}

NOTICES = [
    {"id": uid(601), "kind": "maintenance", "severity": "minor", "title": "Scheduled maintenance: database upgrade", "body": "Casevoya will be read-only for about 20 minutes.", "starts_at": iso(days=4), "ends_at": iso(days=4, minutes=30), "status": "published", "audience": "all", "published_at": iso(days=-1), "resolved_at": None, "resolution_note": None, "created_at": iso(days=-1), "updated_at": iso(days=-1), "version": 1, "phase": "scheduled", "duration_minutes": None, "targets": []},
    {"id": uid(602), "kind": "incident", "severity": "major", "title": "Email delivery delayed", "body": "We'll update this notice as we learn more.", "starts_at": iso(days=-2), "ends_at": iso(days=-2, minutes=135), "status": "published", "audience": "all", "published_at": iso(days=-2), "resolved_at": None, "resolution_note": None, "created_at": iso(days=-2), "updated_at": iso(days=-2), "version": 2, "phase": "ended", "duration_minutes": None, "targets": []},
    {"id": uid(603), "kind": "incident", "severity": "minor", "title": "Upload failures for large PDFs", "body": "Uploads over 20 MB failed for some firms.", "starts_at": iso(days=-15), "ends_at": None, "status": "resolved", "audience": "listed", "published_at": iso(days=-15), "resolved_at": iso(days=-15, minutes=80), "resolution_note": "Fixed the upload size limit.", "created_at": iso(days=-15), "updated_at": iso(days=-15), "version": 3, "phase": "resolved", "duration_minutes": 80, "targets": [{"id": uid(2), "display_name": "Fraser Consulting"}, {"id": uid(4), "display_name": "Northline Immigration"}, {"id": uid(6), "display_name": "Lakeside Visa Services"}]},
]
INCIDENTS = page(NOTICES, current={"status": {"active": 0, "active_incidents": 0, "worst_severity": None, "status": "operational"}, "queues": {"level": "unhealthy", "counts": {"dead_lettered": 2}, "oldest_pending_wait_seconds": 40, "processing_stuck": 0, "failed_last_hour": 0}})
NOTICE_DETAIL = {"notice": NOTICES[1], "history": {"items": [{"id": "a1", "at": iso(days=-2), "action": "admin_portal.notices.posted", "actor_email": "jordan@example.test", "result": "success"}], "limit": 20, "next_cursor": None}}

BODY3 = {"title": "Retainer agreement", "summary": "Standard retainer for permanent residence files.", "items": ["Fees: CA$1,085 permanent residence fee", "Refund within 30 days of written notice.", "Complaints to the College under s. 41 of the Code."]}
BODY4 = {"title": "Retainer agreement", "summary": "Standard retainer for permanent residence files.", "items": ["Fees: CA$1,525 right of permanent residence fee (2026)", "Refund within 30 days of written notice.", "Complaints to the College under s. 41 of the Code.", "New: consent to electronic signatures."]}
VERSION = {
    "version": {"id": uid(704), "template_id": uid(700), "stable_key": "retainer_agreement", "version_number": 4, "status": "draft", "body": BODY4, "content_hash": "h4", "author_name": "Mina Haddad", "author_user_id": uid(902), "test_evidence": "Rendered for 3 sample matters · no missing fields · PDF output checked.", "effective_on": "2026-11-15", "changelog": "Fee schedule updated for 2026 IRCC fees; adds electronic signature consent.", "supersedes_version_id": uid(703), "reviewer_label": None, "reviewed_at": None, "published_at": None, "created_at": iso(days=-1), "updated_at": iso(days=-1)},
    "sources": [{"position": 1, "url": "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account/fees.html", "host": "canada.ca", "official": True, "title": "Fees for immigration applications", "retrieved_on": "2026-10-20", "note": None}, {"position": 2, "url": "https://college-ic.ca/code", "host": "college-ic.ca", "official": True, "title": "Code of Professional Conduct", "retrieved_on": "2026-10-20", "note": None}],
    "reviews": [], "hints": {"isAuthor": False, "hasOfficialSource": True},
    "diff": {"version_id": uid(704), "version_number": 4, "status": "draft", "before": BODY3, "after": BODY4, "changes": [{"field": "items", "before": BODY3["items"], "after": BODY4["items"]}]},
}
HISTORY = {"stable_key": "retainer_agreement", "versions": [
    {"id": uid(704), "version_number": 4, "status": "draft", "author_name": "Mina Haddad", "reviewer_label": None, "reviewed_at": None, "published_at": None, "effective_on": "2026-11-15", "changelog": ""},
    {"id": uid(703), "version_number": 3, "status": "published", "author_name": "Kenji Ito", "reviewer_label": "RCIC R700001", "reviewed_at": iso(days=-60), "published_at": iso(days=-60), "effective_on": "2026-09-01", "changelog": ""},
]}
TEMPLATES = {"templates": [
    {"id": uid(700), "stable_key": "retainer_agreement", "title": "Retainer agreement", "updated_at": iso(days=-1), "published": {"id": uid(703), "version_number": 3, "published_at": iso(days=-60), "reviewer_label": "RCIC R700001"}, "draft": {"id": uid(704), "version_number": 4, "author_name": "Mina Haddad", "author_user_id": uid(902), "created_at": iso(days=-1), "effective_on": "2026-11-15", "sources": 2, "official_sources": 2}, "adopted_by_firms": 4},
    {"id": uid(710), "stable_key": "client_intake", "title": "Client intake checklist", "updated_at": iso(days=-30), "published": {"id": uid(714), "version_number": 4, "published_at": iso(days=-30), "reviewer_label": "RCIC R700001"}, "draft": None, "adopted_by_firms": 5},
    {"id": uid(720), "stable_key": "use_of_rep_cover", "title": "Use of representative cover letter", "updated_at": iso(days=-90), "published": {"id": uid(722), "version_number": 2, "published_at": iso(days=-90), "reviewer_label": "RCIC R700002"}, "draft": None, "adopted_by_firms": 3},
]}
RELEASES = page([
    {"version_id": uid(714), "template_id": uid(710), "stable_key": "client_intake", "title": "Client intake checklist", "version_number": 4, "status": "published", "effective_on": "2026-10-01", "published_at": iso(days=-30), "reviewed_at": iso(days=-30), "reviewer_label": "RCIC R700001", "author_name": "Kenji Ito", "changelog": "Adds the biometrics step.", "adopting_firms": 5},
    {"version_id": uid(703), "template_id": uid(700), "stable_key": "retainer_agreement", "title": "Retainer agreement", "version_number": 3, "status": "published", "effective_on": "2026-09-01", "published_at": iso(days=-60), "reviewed_at": iso(days=-60), "reviewer_label": "RCIC R700001", "author_name": "Kenji Ito", "changelog": "Refund wording clarified.", "adopting_firms": 4},
    {"version_id": uid(713), "template_id": uid(710), "stable_key": "client_intake", "title": "Client intake checklist", "version_number": 3, "status": "superseded", "effective_on": "2026-06-01", "published_at": iso(days=-140), "reviewed_at": iso(days=-140), "reviewer_label": "RCIC R700002", "author_name": "Mina Haddad", "changelog": "Initial public version.", "adopting_firms": 0},
])
DOMAINS = {"items": [{"host": "canada.ca", "match_kind": "suffix", "authority": "Government of Canada"}, {"host": "college-ic.ca", "match_kind": "suffix", "authority": "College of Immigration and Citizenship Consultants"}, {"host": "laws-lois.justice.gc.ca", "match_kind": "exact", "authority": "Justice Laws"}, {"host": "irb-cisr.gc.ca", "match_kind": "suffix", "authority": "Immigration and Refugee Board"}]}
APP_NOTES = {"items": [], "total": 0, "limit": 50, "offset": 0, "stub": True, "gap": "No data source yet: app release notes are not stored anywhere the portal can read."}


def ops_routes():
    return {
        "/health/dead-letters/" + uid(801): DEAD_DETAIL,
        "/health/dead-letters": page(DEAD),
        "/health": HEALTH,
        "/support/requests/" + uid(302): GRANT_DETAIL,
        "/support/requests?state=closed": page([CLOSED_GRANT], counts={"pending": 1, "active": 1, "closed": 7}),
        "/incidents": INCIDENTS,
        "/notices/" + uid(602): NOTICE_DETAIL,
        "/notices": page(NOTICES),
        "/releases/templates": RELEASES,
        "/releases/app-notes": APP_NOTES,
        "/templates/official-domains": DOMAINS,
        "/templates/versions/" + uid(704): VERSION,
        "/templates/history/retainer_agreement": HISTORY,
        "/templates": TEMPLATES,
    }


# ---------------------------------------------------------------- PR 3: subscriptions, usage, verification
# Licence numbers use the R9990xx range so they cannot be mistaken for real College members.

def _exc(n, name, status, plan, reasons, **dates):
    base = {"organization_id": uid(n), "firm_name": name, "sample_mode": n == 8, "status": status, "plan": plan, "billing_interval": "month", "reasons": reasons,
            "trial_ends_at": None, "current_period_end": iso(days=20), "cancel_at": None, "past_due_since": None, "restricted_at": None,
            "latest_invoice_status": "paid", "stripe_customer_id": f"cus_EXAMPLE{n:04d}", "updated_at": iso(days=-1)}
    base.update(dates)
    return base


SUB_ITEMS = [
    _exc(10, "Old Town Immigration", "restricted", "solo", ["restricted"], restricted_at=iso(days=-7)),
    _exc(6, "Lakeside Visa Services", "past_due", "practice", ["past_due", "invoice_unpaid"], past_due_since=iso(days=-10), latest_invoice_status="open"),
    _exc(8, "Maple Pathways", "trial", "solo", ["trial_ending"], trial_ends_at=iso(days=2), latest_invoice_status=None, stripe_customer_id=None),
    _exc(2, "Fraser Consulting", "active", "solo", ["cancel_scheduled"], cancel_at=iso(days=1)),
]
SUBSCRIPTIONS = {"items": SUB_ITEMS, "total": 4, "limit": 100, "offset": 0, "by_reason": {"past_due": 1, "invoice_unpaid": 1, "restricted": 1, "trial_ending": 1, "cancel_scheduled": 1}, "by_status": {"active": 3, "trial": 1, "past_due": 1, "restricted": 1}}

GB = 1024 ** 3


def _use(n, name, plan, status, seats, seat_limit, matters, matter_limit, storage_gb, storage_limit_gb, runs, failed, cost, flags=(), invited=0, sample_matters=0):
    return {"organization_id": uid(n), "display_name": name, "slug": name.lower().replace(" ", "-"), "sample_mode": n == 8, "plan": plan, "subscription_status": status,
            "seats_active": seats, "seats_invited": invited, "seat_limit": seat_limit, "active_matters": matters, "sample_matters": sample_matters, "matter_limit": matter_limit,
            "storage_bytes": int(storage_gb * GB), "storage_limit_bytes": storage_limit_gb * GB if storage_limit_gb else None,
            "ai_runs_30d": runs, "ai_failed_30d": failed, "ai_tokens_30d": runs * 2100, "ai_cost_usd_30d": cost, "flags": list(flags)}


USAGE_ITEMS = [
    _use(12, "Harbourview Legal", "enterprise", "active", 18, None, 612, None, 420, None, 640, 6, 41.20),
    _use(4, "Northline Immigration", "practice", "active", 6, 10, 214, 1000, 96, 200, 301, 1, 19.90, invited=2),
    _use(6, "Lakeside Visa Services", "practice", "past_due", 4, 10, 180, 1000, 188, 200, 190, 4, 12.10, flags=["storage_near"]),
    _use(10, "Old Town Immigration", "solo", "restricted", 1, 2, 104, 100, 21, 20, 48, 0, 3.80, flags=["matters_over", "storage_over"]),
    _use(2, "Fraser Consulting", "solo", "active", 2, 2, 31, 100, 4, 20, 105, 2, 9.40, flags=["seats_near"]),
    _use(8, "Maple Pathways", None, "trial", 1, None, 6, None, 0.2, None, 0, 0, 0, sample_matters=6),
]
USAGE = {"items": USAGE_ITEMS, "total": 6, "flagged_total": 3, "limit": 50, "offset": 0, "near_threshold": 0.9, "ai_window_days": 30,
         "totals": {"seats_active": 32, "active_matters": 1147, "storage_bytes": int(729.2 * GB), "ai_runs_30d": 1284, "ai_cost_usd_30d": 86.40},
         "plans": {"solo": {"seats": 2, "matters": 100, "storage_gb": 20, "monthly_cents": 4900}, "practice": {"seats": 10, "matters": 1000, "storage_gb": 200, "monthly_cents": 14900}, "firm": {"seats": 30, "matters": 5000, "storage_gb": 1000, "monthly_cents": 39900}, "enterprise": {"seats": None, "matters": None, "storage_gb": None, "monthly_cents": None}}}

QUEUE_ROWS = [
    {"credential_id": uid(501), "organization_id": uid(4), "firm_name": "Northline Immigration", "licence_type": "rcic", "college_id": "R999018", "status": "verified", "register_status": "active", "bucket": "needs_review", "latest_result": "needs_review", "checked_at": iso(days=-2), "next_review_at": iso(days=-1), "valid_until": iso(days=63), "verification_method": "manual", "member_role": "consultant"},
    {"credential_id": uid(502), "organization_id": uid(8), "firm_name": "Maple Pathways", "sample_mode": True, "licence_type": "rcic-irb", "college_id": "R999002", "status": "unverified", "register_status": None, "bucket": "never_checked", "latest_result": None, "checked_at": None, "next_review_at": None, "valid_until": None, "verification_method": None, "member_role": "owner"},
    {"credential_id": uid(503), "organization_id": uid(6), "firm_name": "Lakeside Visa Services", "licence_type": "rcic", "college_id": "R999045", "status": "verified", "register_status": "active", "bucket": "due", "latest_result": "verified", "checked_at": iso(days=-107), "next_review_at": iso(days=1), "valid_until": iso(days=63), "verification_method": "cicc_list", "member_role": "owner"},
    {"credential_id": uid(504), "organization_id": uid(2), "firm_name": "Fraser Consulting", "licence_type": "rcic", "college_id": "R999077", "status": "verified", "register_status": "active", "bucket": "overdue", "latest_result": "verified", "checked_at": iso(days=-120), "next_review_at": iso(days=-3), "valid_until": iso(days=63), "verification_method": "manual", "member_role": "owner"},
]
QUEUE = {"kind": "all", "counts": {"adverse": 0, "needs_review": 1, "never_checked": 1, "overdue": 1, "due": 2, "all": 4}, "items": QUEUE_ROWS, "total": 4, "limit": 50, "offset": 0}
CICC_IMPORT = {"id": uid(551), "imported_at": iso(days=-15), "imported_by_email": "kenji@example.test", "source_note": "college-ic.ca public register export (CSV)", "row_count": 9812, "status": "complete", "completed_at": iso(days=-15, minutes=2), "file_sha256": "3f9a1c0be47d2e55a01c9d8e7f6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
               "needs_review": [{"credential_id": uid(501), "organization_id": uid(4), "firm_name": "Northline Immigration", "licence_type": "rcic", "college_id": "R999018", "credential_status": "verified", "checked_at": iso(days=-15), "reason": "Name on the list does not match the consultant's profile"}]}
VER_SUMMARY = {"firmsByVerification": {"verified": 4, "pending_review": 1, "unverified": 0, "restricted": 1}, "licenceCounts": QUEUE["counts"], "workload": {"firms_pending_review": 1, "credentials_needing_review": 1, "credentials_never_checked": 1}, "latestCiccImport": CICC_IMPORT}
CREDENTIAL = {
    "credential": {"id": uid(501), "organization_id": uid(4), "firm_name": "Northline Immigration", "licence_type": "rcic", "college_id": "R999018", "status": "verified", "register_status": "active", "entitlement_to_practise": True,
                   "discipline_suspended": False, "discipline_revoked": False, "discipline_restricted": False, "discipline_restriction_detail": None, "verification_method": "manual",
                   "source_url": "https://register.college-ic.ca/Public-Register-EN/Licensee/Profile.aspx", "declared_at": iso(days=-300), "checked_at": iso(days=-2), "next_review_at": iso(days=-1), "valid_until": iso(days=63), "member_role": "consultant"},
    "checks": [
        {"id": uid(5101), "result": "needs_review", "retrieved_at": iso(days=-2), "source_host": "register.college-ic.ca", "method": "manual", "register_status": "active", "reviewer_email": "kenji@example.test", "proof_locator": "drive://licence-evidence/R999018-check.png", "created_at": iso(days=-2), "cicc_import_id": None},
        {"id": uid(5102), "result": "verified", "retrieved_at": iso(days=-107), "source_host": None, "method": "cicc_list", "register_status": "active", "reviewer_email": None, "proof_locator": None, "created_at": iso(days=-107), "cicc_import_id": uid(550)},
        {"id": uid(5103), "result": "verified", "retrieved_at": iso(days=-230), "source_host": "register.college-ic.ca", "method": "manual", "register_status": "active", "reviewer_email": "mina@example.test", "proof_locator": "drive://licence-evidence/R999018-initial.png", "created_at": iso(days=-230), "cicc_import_id": None},
    ],
    "change_reports": [],
}


def records_routes():
    return {
        "/subscriptions/exceptions": SUBSCRIPTIONS,
        "/usage": USAGE,
        "/verification/summary": VER_SUMMARY,
        "/licences/queue": QUEUE,
        "/licences/cicc-imports": {"imports": [CICC_IMPORT]},
        "/licences/credentials/" + uid(501): CREDENTIAL,
    }


# --- Config, admins, audit, privacy, sample mode, migration (all fictional) ---
def _setting(key, value, desc, days_ago, version, pending=False):
    editable = isinstance(value, dict) and set(value) == {"unit", "count"}
    units = (["business_days"] if key == "licence.manual_check_target" else ["days", "months"]) if editable else []
    return {"key": key, "value": value, "description": desc, "pending_confirmation": pending, "created_at": iso(days=-200), "updated_at": None if pending else iso(days=-days_ago), "version": version, "editable": editable, "allowed_units": units}


SETTINGS = [
    _setting("email.support_address", {"address": "support@example.test"}, "Where firms reach support", 120, 1),
    _setting("licence.manual_check_target", {"unit": "business_days", "count": 2}, "Target to finish a manual check", 0, 1, pending=True),
    _setting("licence.recheck_interval", {"unit": "days", "count": 90}, "How often a current licence is checked again", 78, 2),
    _setting("sample_mode.allowed", {"enabled": True}, "Firms may turn on sample mode", 150, 1),
    _setting("source.recheck_interval.canada.ca", {"unit": "days", "count": 30}, "How often canada.ca sources are re-read", 120, 1),
    _setting("support.grant_requests", {"enabled": True}, "Admins may request firm-approved support access", 90, 1),
    _setting("trial.duration", {"unit": "days", "count": 14}, "Length of a new firm's free trial", 57, 3),
    _setting("uploads.max_mb", {"documents": 50, "imports": 200}, "Upload size limits", 150, 1),
]
CONFIG = {"settings": SETTINGS, "switches": [{"key": s["key"], "enabled": s["value"]["enabled"], "description": s["description"], "editable": False} for s in SETTINGS if isinstance(s["value"], dict) and "enabled" in s["value"]],
          "featureFlags": {"items": [], "stub": True, "gap": "No feature-flag service yet. The switches shown are product settings whose value has an `enabled` boolean; per-firm or percentage flags do not exist."}}

ADMINS = {
    "admins": [
        {"user_id": uid(900), "email": "jordan@example.test", "role": "owner", "template_reviewer": False, "note": None, "created_at": iso(days=-300), "created_by_email": None, "last_sign_in_at": iso(minutes=-20), "verified_factors": 1, "licensed": False},
        {"user_id": uid(901), "email": "kenji@example.test", "role": "operator", "template_reviewer": True, "note": "Licensing lead", "created_at": iso(days=-262), "created_by_email": "jordan@example.test", "last_sign_in_at": iso(minutes=-190), "verified_factors": 2, "licensed": True},
        {"user_id": uid(902), "email": "mina@example.test", "role": "operator", "template_reviewer": True, "note": None, "created_at": iso(days=-262), "created_by_email": "jordan@example.test", "last_sign_in_at": iso(days=-1), "verified_factors": 1, "licensed": False},
        {"user_id": uid(903), "email": "ava@example.test", "role": "viewer", "template_reviewer": False, "note": None, "created_at": iso(days=-56), "created_by_email": "kenji@example.test", "last_sign_in_at": iso(days=-8), "verified_factors": 1, "licensed": False},
    ],
    "invites": [
        {"id": uid(1101), "email": "daniel@example.test", "role": "operator", "template_reviewer": False, "note": "Support rotation", "status": "pending", "invited_by_email": "jordan@example.test", "invited_at": iso(days=-1), "expires_at": iso(days=6), "accepted_at": None, "cancelled_at": None},
        {"id": uid(1102), "email": "priya@example.test", "role": "viewer", "template_reviewer": False, "note": None, "status": "expired", "invited_by_email": "kenji@example.test", "invited_at": iso(days=-16), "expires_at": iso(days=-9), "accepted_at": None, "cancelled_at": None},
        {"id": uid(1103), "email": "ava@example.test", "role": "viewer", "template_reviewer": False, "note": None, "status": "accepted", "invited_by_email": "kenji@example.test", "invited_at": iso(days=-57), "expires_at": iso(days=-50), "accepted_at": iso(days=-56), "cancelled_at": None},
    ],
    "removals": [
        {"id": uid(1201), "user_id": uid(904), "email": "sam@example.test", "role": "operator", "removed_at": iso(days=-40), "removed_by_email": "jordan@example.test", "reason": "Left the company."},
    ],
}
INVITE_OK = {"id": uid(1104), "accessReady": False, "nextSteps": [
    "Add the email to the Cloudflare Access policy for admin.casevoya.ca.",
    "Add the email to ADMIN_ALLOWED_EMAILS in casevoya-admin/wrangler.jsonc and deploy.",
    "Tell them to sign in to admin.casevoya.ca and accept the invite (they need a Casevoya account with an authenticator app).",
]}


def _ev(n, mins, action, result, actor, firm_n, firm, table, obj, ctx=None, diff=None, actor_type="admin"):
    return {"id": uid(1300 + n), "occurred_at": iso(minutes=-mins), "action": action, "result": result, "actor_type": actor_type, "actor_user_id": uid(901) if actor else None, "actor_email": actor,
            "organization_id": uid(firm_n) if firm_n else None, "firm_name": firm, "object_table": table, "object_id": obj, "request_id": f"req_{n:02d}a7c41e", "context": ctx, "diff_keys": diff or []}


AUDIT = {"items": [
    _ev(1, 7, "admin_portal.health.replayed", "success", "mina@example.test", 1, "Northline Immigration", "outbox_events", uid(801), {"event_type": "email.send", "reason": "Mail provider fixed the rejected-recipient bug."}),
    _ev(2, 34, "support_access.approved", "success", None, 1, "Northline Immigration", "support_access_requests", uid(302), {"minutes": 60, "scope": "matter_documents"}, actor_type="firm_owner"),
    _ev(3, 300, "licence.checked", "success", "kenji@example.test", 1, "Northline Immigration", "consultant_credentials", uid(501), {"method": "manual", "result": "verified"}),
    _ev(4, 1290, "admin_portal.config.setting_changed", "denied", "ava@example.test", None, None, "product_settings", None, {"error_code": "forbidden", "key": "trial.duration"}),
    _ev(5, 1720, "subscription.payment_failed", "failure", None, 6, "Lakeside Visa Services", "organization_subscriptions", uid(1401), None, ["status", "latest_invoice_status"], actor_type="system"),
], "limit": 50, "next_cursor": {"before_at": iso(minutes=-1720), "before_id": uid(1305)}}


def _pr(n, firm_n, firm, ref, kind, channel, received, due, left, stage, assigned, outcome=None, closed=False, extended=None, sample=False):
    return {"id": uid(1500 + n), "organization_id": uid(firm_n), "firm_name": firm, "reference": ref, "kind": kind, "channel": channel, "received_on": received, "due_on": due, "extended_due_on": extended, "effective_due_on": extended or due,
            "target_days": 30, "days_left": None if closed else left, "overdue": not closed and left < 0, "due_soon": not closed and 0 <= left <= 5, "stage": stage, "assigned": assigned, "outcome": outcome, "closed_at": iso(days=-3) if closed else None, "is_sample": sample}


def _d(days):
    return (NOW + timedelta(days=days)).date().isoformat()


PRIVACY = {"items": [
    _pr(1, 6, "Lakeside Visa Services", "PR-0031", "access", "email", _d(-35), _d(-5), -5, "identity_verified", True),
    _pr(2, 1, "Northline Immigration", "PR-0040", "correction", "portal", _d(-26), _d(4), 4, "scoped", True),
    _pr(3, 3, "Harbourview Legal", "PR-0044", "access", "letter", _d(-9), _d(21), 21, "received", False),
    _pr(4, 1, "Northline Immigration", "PR-0038", "deletion", "portal", _d(-40), _d(-10), 34, "scoped", True, extended=_d(24)),
], "total": 4, "summary": {"open": 4, "overdue": 1, "due_soon": 1, "closed_30d": 4, "open_by_kind": {"access": 2, "correction": 1, "deletion": 1}}, "due_soon_days": 5, "limit": 50, "offset": 0}
BREACHES = {"items": [], "total": 0, "limit": 50, "offset": 0, "stub": True, "gap": "No data source yet: there is no breach (privacy incident) register table. Firms record breaches outside Casevoya today."}

PROOF = ["intake", "agreement", "upload", "reminder", "invoice", "export"]
SAMPLE = {"items": [
    {"organization_id": uid(5), "display_name": "Maple Pathways", "slug": "maple-pathways", "sample_mode": True, "sample_matters": 6, "real_matters": 0, "sample_privacy_requests": 1, "sample_migration_batches": 1, "sample_ai_runs": 14, "proof_steps_done": PROOF[:3], "proof_complete": False, "mixed": False},
    {"organization_id": uid(4), "display_name": "Fraser Consulting", "slug": "fraser-consulting", "sample_mode": False, "sample_matters": 2, "real_matters": 11, "sample_privacy_requests": 0, "sample_migration_batches": 0, "sample_ai_runs": 3, "proof_steps_done": PROOF, "proof_complete": True, "mixed": True},
], "total": 2, "summary": {"firms_in_sample_mode": 1, "firms_total": 2, "proof_complete": 1, "mixed": 1}, "proof_steps": PROOF, "limit": 100, "offset": 0}
SAMPLE_EMPTY = {**SAMPLE, "items": [], "total": 0, "summary": {"firms_in_sample_mode": 0, "firms_total": 0, "proof_complete": 0, "mixed": 0}}


def _job(n, firm_n, firm, kind, source, status, size_mb, src, staged, files, exc, **kw):
    base = {"id": uid(1600 + n), "organization_id": uid(firm_n), "firm_name": firm, "kind": kind, "source_system": source, "status": status, "is_sample": False, "byte_size": int(size_mb * 1024 * 1024),
            "source_row_count": src, "staged_row_count": staged, "attachment_files": files, "attachment_bytes": files * 180_000 if files else None,
            "plan_counts": {"clients": src, "matters": staged // 2, "documents": files}, "result_counts": {}, "pilot_counts": {}, "exception_count": exc, "pilot_size": None,
            "verified_at": None, "checked_at": None, "pilot_started_at": None, "pilot_completed_at": None, "pilot_signed_off_at": None, "full_run_started_at": None, "commit_started_at": None,
            "committed_at": None, "commit_verified_at": None, "rolled_back_at": None, "discarded_at": None, "purge_after": iso(days=30), "staging_purged_at": None, "stuck": False, "purge_due": False,
            "created_at": iso(days=-2), "updated_at": iso(minutes=-50)}
    base.update(kw)
    return base


MIGRATION = {"items": [
    _job(1, 3, "Harbourview Legal", "matters", "officio", "committing", 48, 1204, 1204, 312, 6, stuck=True, checked_at=iso(days=-1), pilot_size=50, pilot_started_at=iso(days=-1), pilot_completed_at=iso(days=-1), pilot_signed_off_at=iso(minutes=-200), commit_started_at=iso(minutes=-48), pilot_counts={"clients": 50, "matters": 25}),
    _job(2, 1, "Northline Immigration", "clients", "csv", "checked", 2, 390, 388, 0, 2, checked_at=iso(days=-1), updated_at=iso(days=-1)),
    _job(3, 5, "Maple Pathways", "clients", "csv", "committed", 0.1, 25, 25, 0, 0, is_sample=True, pilot_size=5, pilot_started_at=iso(days=-5), pilot_completed_at=iso(days=-5), pilot_signed_off_at=iso(days=-5), commit_started_at=iso(days=-5), committed_at=iso(days=-5), commit_verified_at=iso(days=-5), purge_after=iso(days=-1), purge_due=True, result_counts={"clients": 25, "matters": 12}, updated_at=iso(days=-5)),
    _job(4, 6, "Lakeside Visa Services", "documents", "clio", "rolled_back", 12, 640, 640, 88, 0, rolled_back_at=iso(days=-12), updated_at=iso(days=-12), staging_purged_at=iso(days=-10)),
], "total": 4, "summary": {"by_status": {"staged": 0, "checked": 1, "committing": 1, "committed": 1, "rolled_back": 1, "discarded": 0}, "stuck": 1, "purge_due": 1, "active": 2}, "stuck_after_minutes": 30, "limit": 50, "offset": 0}


def admin_routes():
    return {
        "/config": CONFIG,
        "/admins": ADMINS,
        "POST /admins/invites": INVITE_OK,
        "/audit": AUDIT,
        "/privacy/requests": PRIVACY,
        "/privacy/breaches": BREACHES,
        "/sample-mode": SAMPLE,
        "/migration/jobs": MIGRATION,
    }


# ---------------------------------------------------------------- first-admin Setup (/setup)

def fake_qr_svg():
    """A deterministic QR-looking pattern (NOT a real code; fixtures only)."""
    import random
    rnd = random.Random(7)
    n, cells = 25, []
    def finder(x, y):
        return [(x + i, y + j) for i in range(7) for j in range(7) if i in (0, 6) or j in (0, 6) or (2 <= i <= 4 and 2 <= j <= 4)]
    fixed = set(finder(0, 0) + finder(18, 0) + finder(0, 18))
    reserved = {(x + i, y + j) for x, y in ((0, 0), (18, 0), (0, 18)) for i in range(-1, 8) for j in range(-1, 8)}
    for x in range(n):
        for y in range(n):
            if (x, y) in fixed or ((x, y) not in reserved and rnd.random() < 0.45):
                cells.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 {n + 2} {n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="{n + 2}" height="{n + 2}" fill="#fff"/><g fill="#111">{"".join(cells)}</g></svg>'
    from urllib.parse import quote
    return "data:image/svg+xml;utf-8," + quote(svg)


def setup_state(step="account", exists=True, full_name="Francis Alagbe", verified=False, pending=False):
    return {"state": "open", "email": "admin@casevoya.ca", "step": step, "account": {"exists": exists, "fullName": full_name if exists else None},
            "authenticator": {"verified": verified, "pending": pending}, "passwordMinLength": 12, "signInAvailable": True}


SETUP_ENROL = {"mode": "new", "factorId": uid(990), "qrCode": fake_qr_svg(), "secret": "JBSWY3DPEHPK3PXPFAKEFIXTURE", "uri": "otpauth://totp/Casevoya%20admin:admin@casevoya.ca?secret=FAKE"}
