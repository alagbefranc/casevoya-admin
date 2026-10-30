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
