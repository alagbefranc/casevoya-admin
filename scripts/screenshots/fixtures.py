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
