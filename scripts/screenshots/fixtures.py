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
