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
    {"name": "62-sample-empty", "url": "/sample-mode", "routes": {"/sample-mode": fx.SAMPLE_EMPTY}},
]

SIGNED_OUT = {"signedIn": False, "userId": None, "aal": None, "expiresAt": None, "stepUpAt": None, "stepUpFreshUntil": None, "matchesAccessUser": False}
INVITED = {**fx.ME, "role": None, "email": "daniel@example.test", "session": SIGNED_OUT, "invite": {"id": fx.uid(800), "role": "operator", "template_reviewer": True, "expires_at": fx.iso(days=6), "invited_at": fx.iso(days=-1)},
           "capabilities": {**fx.ME["capabilities"], "operate": False, "manageAdmins": False, "reviewTemplates": False, "acceptInvite": True}}
STEP_UP = (403, {"error": {"code": "step_up_required", "message": "Enter a code from your authenticator app to continue", "requestId": "req_example_0403s"}})
GRANT_422 = (422, {"error": {"code": "validation_failed", "message": "Check the form", "details": {"issues": [
    {"path": "organizationId", "message": "Choose a firm."},
    {"path": "reason", "message": "Write a reason of 8 to 1000 characters."},
    {"path": "confirmFirmNotified", "message": "Tick the box to confirm the owners must approve."},
]}, "requestId": "req_example_0422"}})

SCENARIOS += [
    {"name": "47-invite-signed-out", "url": "/", "routes": {"/session": INVITED}},
    {"name": "49-stepup-dialog", "url": "/config/admins", "errors": {f"PATCH /admins/{fx.uid(901)}/reviewer": STEP_UP}, "steps": [("click", "input[aria-label='Template reviewer: kenji@example.test']"), ("wait", 400)], "full": False},
    {"name": "53-state-slow", "url": "/firms", "errors": {"GET /firms": (200, "HANG")}, "wait": "main h1", "settle": 10800},
    {"name": "58-state-stale", "url": "/usage", "steps": [("fail", ("GET /usage", UPSTREAM)), ("eval", "window.dispatchEvent(new CustomEvent('cv:refresh'))"), ("wait", 600)]},
    {"name": "59-state-validation", "url": f"/grants?request={fx.uid(6)}", "errors": {"POST /support/requests": GRANT_422}, "steps": [
        ("fill", ("#g-name", "Jordan Reid")), ("fill", ("#g-reason", "Owner asked us to check a failed upload.")), ("click", ".drawer .check input"), ("click", "button:has-text('Send request')"), ("wait", 500)], "full": False},
]

# First-admin Setup (/setup). GET /setup decides the step; the server locks it (409) once an admin exists.
SETUP_LOCKED = (409, {"error": {"code": "conflict", "message": "Setup is locked: the first platform admin already exists. Ask an owner to invite you.", "details": {"locked": True, "lockedAt": "2026-10-30T19:05:00Z"}, "requestId": "req_example_0409"}})
SETUP_DOWN = (502, {"error": {"code": "upstream_error", "message": "Database did not answer", "requestId": "req_example_0502"}})
SETUP_BAD_PW = (422, {"error": {"code": "validation_failed", "message": "That password was not accepted for this account", "details": {"issues": [{"path": "password", "message": "That password was not accepted for this account"}], "canReset": True}, "requestId": "req_example_0422p"}})
SETUP_BAD_CODE = (422, {"error": {"code": "validation_failed", "message": "That code was not accepted", "details": {"issues": [{"path": "code", "message": "That code was not accepted"}]}, "requestId": "req_example_0422c"}})

SCENARIOS += [
    {"name": "setup-0-root-redirect", "url": "/", "errors": {"GET /session": FORBIDDEN}, "routes": {"/setup": fx.setup_state()}, "wait": ".box.setup h1", "settle": 1500},
    {"name": "setup-1-account", "url": "/setup", "routes": {"/setup": fx.setup_state()}},
    {"name": "setup-1-account-new", "url": "/setup", "routes": {"/setup": fx.setup_state(exists=False)}, "steps": [("fill", ("#setup-name", "Francis Alagbe"))]},
    {"name": "setup-1-wrong-password", "url": "/setup", "routes": {"/setup": fx.setup_state()}, "errors": {"POST /setup/account": SETUP_BAD_PW}, "steps": [("fill", ("#setup-password", "not the right one")), ("click", "button:has-text('Continue')"), ("wait", 500)]},
    {"name": "setup-1-reset", "url": "/setup", "routes": {"/setup": fx.setup_state()}, "errors": {"POST /setup/account": SETUP_BAD_PW}, "steps": [("fill", ("#setup-password", "not the right one")), ("click", "button:has-text('Continue')"), ("wait", 400), ("click", "button:has-text('Set a new password')"), ("wait", 200)]},
    {"name": "setup-2-authenticator", "url": "/setup", "routes": {"/setup": fx.setup_state("authenticator"), "POST /setup/authenticator": fx.SETUP_ENROL}, "wait": "img.qr"},
    {"name": "setup-2-bad-code", "url": "/setup", "routes": {"/setup": fx.setup_state("authenticator"), "POST /setup/authenticator": fx.SETUP_ENROL}, "errors": {"POST /setup/authenticator/verify": SETUP_BAD_CODE}, "wait": "img.qr", "steps": [("fill", ("#setup-code", "000000")), ("click", "button:has-text('Verify and continue')"), ("wait", 400)]},
    {"name": "setup-2-pending", "url": "/setup", "routes": {"/setup": fx.setup_state("authenticator", pending=True), "POST /setup/authenticator": {"mode": "pending"}}},
    {"name": "setup-3-finish", "url": "/setup", "routes": {"/setup": fx.setup_state("finish", verified=True)}, "steps": [("click", ".check input")]},
    {"name": "setup-3-done", "url": "/setup", "routes": {"/setup": fx.setup_state("finish", verified=True), "POST /setup/finish": {"done": True, "userId": fx.uid(1), "role": "owner"}}, "steps": [("click", ".check input"), ("click", "button:has-text('Finish setup')"), ("wait", 300)]},
    {"name": "setup-locked", "url": "/setup", "errors": {"GET /setup": SETUP_LOCKED}},
    {"name": "setup-error", "url": "/setup", "errors": {"GET /setup": SETUP_DOWN}},
    {"name": "setup-error-retrying", "url": "/setup", "errors": {"GET /setup": SETUP_DOWN}, "steps": [("fail", ("GET /setup", (200, "HANG"))), ("click", "button:has-text('Try again')"), ("wait", 300)]},
    {"name": "setup-loading", "url": "/setup", "errors": {"GET /setup": (200, "HANG")}, "wait": ".box.setup", "settle": 600},
]
