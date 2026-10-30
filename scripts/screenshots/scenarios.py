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
