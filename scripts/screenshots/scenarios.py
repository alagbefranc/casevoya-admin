"""Screens to capture. Names follow docs/design/platform-admin/screenshots/spec-pass for side-by-side review."""
import fixtures as fx

FORBIDDEN = (403, {"error": {"code": "forbidden", "message": "This user is not a platform admin and has no open invite", "requestId": "req_example_0403"}})
UPSTREAM = (502, {"error": {"code": "upstream_error", "message": "Database did not answer", "requestId": "req_example_0502"}})

SCENARIOS = [
    {"name": "01-overview", "url": "/"},
    {"name": "02-firms", "url": "/firms"},
    {"name": "03-firm-detail", "url": f"/firms/{fx.uid(6)}"},
    {"name": "44-noaccess", "url": "/", "errors": {"GET /session": FORBIDDEN}},
    {"name": "45-gate-error", "url": "/", "errors": {"GET /session": UPSTREAM}},
    {"name": "46-invite-accept", "url": "/", "routes": {"/session": {**fx.ME, "role": None, "invite": {"id": fx.uid(800), "role": "operator", "template_reviewer": True, "expires_at": fx.iso(days=6), "invited_at": fx.iso(days=-1)}, "capabilities": {**fx.ME["capabilities"], "operate": False, "manageAdmins": False, "acceptInvite": True}}}},
    {"name": "48-signin-dialog", "url": "/", "routes": {"/session": {**fx.ME, "session": {"signedIn": False, "userId": None, "aal": None, "expiresAt": None, "stepUpAt": None, "stepUpFreshUntil": None, "matchesAccessUser": False}}}, "steps": [("click", ".topbar .chip")], "full": False},
    {"name": "50-access-ended", "url": "/", "errors": {"GET /session": (401, {"error": {"code": "unauthenticated", "message": "Access token missing", "requestId": "req_example_0401"}})}},
    {"name": "51-session-mismatch", "url": "/", "routes": {"/session": {**fx.ME, "session": {**fx.ME["session"], "matchesAccessUser": False}}}},
    {"name": "52-state-loading", "url": "/firms", "errors": {"GET /firms": (200, "HANG")}, "wait": "main", "settle": 600},
    {"name": "54-state-filtered", "url": "/firms?verification=restricted&plan=enterprise", "routes": {"/firms": fx.page([])}},
    {"name": "55-state-error", "url": "/firms", "errors": {"GET /firms": UPSTREAM}},
    {"name": "56-state-denied", "url": "/firms", "errors": {"GET /firms": FORBIDDEN}},
    {"name": "57-state-offline", "url": "/firms", "steps": [("offline", None), ("wait", 300)]},
    {"name": "63-overview-complaints", "url": "/", "steps": [("click", "text=Complaints overdue")], "full": False},
]

STALE = {**fx.ME, "session": {**fx.ME["session"], "stepUpFreshUntil": fx.unix(0.5)}}
VIEWER = {**fx.ME, "role": "viewer", "capabilities": {**fx.ME["capabilities"], "operate": False, "manageAdmins": False, "reviewTemplates": False}}

SCENARIOS += [
    {"name": "11-grants", "url": "/grants"},
    {"name": "12-grants-active", "url": "/grants?state=active"},
    {"name": "13-grant-detail", "url": f"/grants/{fx.uid(302)}"},
    {"name": "14-grant-request-form", "url": f"/grants?request={fx.uid(6)}", "full": False},
    {"name": "15-health", "url": "/health"},
    {"name": "16-health-drawer", "url": f"/health?event={fx.uid(801)}", "full": False},
    {"name": "17-health-retry-dialog", "url": "/health", "steps": [("click", "table.dt button:has-text('Retry')"), ("fill", ("#cf-reason", "Mail provider fixed the rejected-recipient bug."))], "full": False},
    {"name": "18-health-retry-stale-code", "url": "/health", "routes": {"/session": STALE}, "steps": [("click", "table.dt button:has-text('Retry')")], "full": False},
    {"name": "19-health-empty", "url": "/health", "routes": {"/health": fx.HEALTH_OK, "/health/dead-letters": fx.page([])}},
    {"name": "20-incidents", "url": "/incidents"},
    {"name": "21-incidents-notices", "url": "/incidents?tab=notices"},
    {"name": "22-notice-drawer", "url": f"/incidents?notice={fx.uid(602)}", "full": False},
    {"name": "23-post-notice-form", "url": "/incidents?tab=notices&post=", "full": False},
    {"name": "24-incidents-empty", "url": "/incidents", "routes": {"/incidents": {**fx.INCIDENTS, "items": [], "total": 0}}},
    {"name": "25-releases", "url": "/releases"},
    {"name": "26-releases-templates", "url": "/releases?tab=templates"},
    {"name": "27-release-notes-stub", "url": "/releases?tab=notes"},
    {"name": "28-version-diff", "url": f"/releases/templates/{fx.uid(704)}"},
    {"name": "29-approve-dialog", "url": f"/releases/templates/{fx.uid(704)}", "steps": [("click", "button:has-text('Approve and publish')"), ("click", ".dialog .check input")], "full": False},
    {"name": "60-viewer-health", "url": "/health", "routes": {"/session": VIEWER}},
]

SCENARIOS += [
    {"name": "04-subscriptions", "url": "/subscriptions"},
    {"name": "05-usage", "url": "/usage"},
    {"name": "06-verification", "url": "/verification?kind=all"},
    {"name": "07-verification-cicc", "url": "/verification?tab=cicc"},
    {"name": "08-credential", "url": f"/verification/credentials/{fx.uid(501)}"},
    {"name": "09-credential-check-form", "url": f"/verification/credentials/{fx.uid(501)}", "steps": [("click", "button:has-text('Record manual check')"), ("select", ("#c-reg", "active")), ("wait", 200)], "full": False},
    {"name": "10-cicc-upload", "url": "/verification?tab=cicc&upload=1", "full": False},
    {"name": "61-subscriptions-empty", "url": "/subscriptions", "routes": {"/subscriptions/exceptions": {**fx.SUBSCRIPTIONS, "items": [], "total": 0, "by_reason": {}}}},
]

OPERATOR = {**fx.ME, "role": "operator", "capabilities": {**fx.ME["capabilities"], "manageAdmins": False}}

SCENARIOS += [
    {"name": "30-config-settings", "url": "/config"},
    {"name": "31-config-change-drawer", "url": "/config?edit=trial.duration", "steps": [("fill", ("#s-count", "21")), ("fill", ("#s-reason", "Pilot firms asked for three weeks to finish onboarding."))], "full": False},
    {"name": "32-config-switches", "url": "/config?tab=switches"},
    {"name": "33-config-flags-stub", "url": "/config?tab=flags"},
    {"name": "34-admins", "url": "/config/admins"},
    {"name": "35-admin-invite-form", "url": "/config/admins?invite=1", "steps": [("fill", ("#i-email", "daniel.r@example.test")), ("fill", ("#i-note", "Support rotation"))], "full": False},
    {"name": "36-admin-invite-next-steps", "url": "/config/admins?invite=1", "steps": [("fill", ("#i-email", "daniel.r@example.test")), ("click", "button:has-text('Create invite')"), ("wait", 400)], "full": False},
    {"name": "37-admin-remove-dialog", "url": "/config/admins", "steps": [("click", "table.dt button:has-text('Remove') >> nth=2"), ("fill", ("#cf-reason", "Moved to another team."))], "full": False},
    {"name": "38-admins-operator-denied", "url": "/config/admins", "routes": {"/session": OPERATOR}},
    {"name": "39-audit", "url": "/audit"},
    {"name": "39b-audit-expanded", "url": "/audit", "steps": [("click", "button[aria-label='Show details'] >> nth=0")]},
    {"name": "40-privacy", "url": "/privacy"},
    {"name": "41-breach-stub", "url": "/privacy?tab=breaches"},
    {"name": "42-sample-mode", "url": "/sample-mode"},
    {"name": "43-migration", "url": "/migration"},
    {"name": "43b-migration-expanded", "url": "/migration", "steps": [("click", "button[aria-label='Show counts'] >> nth=0")]},
    {"name": "64-privacy-overdue-empty", "url": "/privacy?state=overdue", "routes": {"/privacy/requests": {**fx.PRIVACY, "items": [], "total": 0}}},
    {"name": "65-sample-empty", "url": "/sample-mode", "routes": {"/sample-mode": fx.SAMPLE_EMPTY}},
]
