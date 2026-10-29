import { describe, expect, it } from "vitest";
import { handle } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { AdminDenied, type AdminRole } from "@/lib/guard";
import { ID, ME, ORG, OTHER, auditCalls, deps, fakeDb, req } from "./api-helpers";

/**
 * One case per endpoint: an authorization denial, a validation failure and a happy path. Mutations also
 * prove they write an audit entry. The list must cover every endpoint in the registry.
 */
type Case = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  /** Concrete URL for the happy path (query string for GET). */
  url: string;
  body?: Record<string, unknown>;
  /** A request that fails validation (url + body). */
  bad: { url: string; body?: Record<string, unknown> };
  /** Role that must be refused (null = test the Access gate instead). */
  deny: AdminRole | null;
  /** The function the happy path must call, and on which client. */
  calls: string;
  on?: "service" | "user";
  rpcs?: Record<string, unknown>;
  tables?: Record<string, Record<string, unknown>[]>;
  session?: "fresh";
  reviewer?: boolean;
  status?: number;
  role?: AdminRole | null;
};

const credential = { credential: { id: ID, organization_id: ORG }, checks: [] };
const version = (status = "draft", author: string | null = OTHER) => ({
  version: { id: ID, template_id: ID, stable_key: "study_permit", status, author_user_id: author },
  sources: [{ official: true }],
  reviews: [],
});
const notice = { id: ID, status: "published", starts_at: null, ends_at: null, audience: "all", kind: "incident", title: "Slow uploads" };
const goodCheck = {
  sourceUrl: "https://register.college-ic.ca/Public-Register-EN/Licensee/Profile.aspx?ID=1",
  retrievedAt: "2026-10-29T12:00:00-05:00",
  registerStatus: "active",
  entitledToPractise: true,
  disciplineSuspended: false,
  disciplineRevoked: false,
  disciplineRestricted: false,
  proofLocator: "drive://licence-proofs/r1.pdf",
};
const goodDraft = {
  stableKey: "study_permit",
  authorName: "Ops",
  title: "Study permit checklist",
  summary: "",
  items: ["Passport", "Letter of acceptance"],
  testEvidence: "Compared with IRCC page on 2026-10-29",
  effectiveOn: "2026-11-01",
  changelog: "First version",
  sources: [{ url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html" }],
};
const csv = "Licence Number,Name,Status\nR500001,Test Person,Active\nR500002,Other Person,Suspended\n";

const reviseBody: Record<string, unknown> = { ...goodDraft };
delete reviseBody.stableKey;
delete reviseBody.authorName;

const CASES: Case[] = [
  // session
  { method: "GET", path: "/session", url: "/session", bad: { url: "/session" }, deny: null, calls: "platform_admin_list", rpcs: { platform_admin_list: { admins: [{ user_id: ME, licensed: true, verified_factors: 1 }] } } },
  { method: "POST", path: "/session/sign-in", url: "/session/sign-in", body: { password: "pw", code: "123456" }, bad: { url: "/session/sign-in", body: { password: "pw", code: "12" } }, deny: null, calls: "" },
  { method: "POST", path: "/session/step-up", url: "/session/step-up", body: { code: "123456" }, bad: { url: "/session/step-up", body: { code: "abc" } }, deny: null, calls: "", session: "fresh" },
  { method: "POST", path: "/session/sign-out", url: "/session/sign-out", body: {}, bad: { url: "/session/sign-out", body: [] as never }, deny: null, calls: "" },
  { method: "GET", path: "/session/invite", url: "/session/invite", bad: { url: "/session/invite" }, deny: null, calls: "" },
  { method: "POST", path: "/session/accept-invite", url: "/session/accept-invite", body: { confirm: true }, bad: { url: "/session/accept-invite", body: { confirm: false } }, deny: null, calls: "accept_platform_admin_invite", on: "user", session: "fresh", role: null, rpcs: {} },
  // overview
  { method: "GET", path: "/overview", url: "/overview", bad: { url: "/overview" }, deny: null, calls: "platform_overview" },
  { method: "GET", path: "/overview/support-sla", url: "/overview/support-sla?days=7", bad: { url: "/overview/support-sla?days=0" }, deny: null, calls: "platform_support_sla" },
  { method: "GET", path: "/overview/complaints", url: "/overview/complaints", bad: { url: "/overview/complaints" }, deny: null, calls: "platform_complaints_overview" },
  // firms
  { method: "GET", path: "/firms", url: "/firms?search=acme&verification=verified&sample=false&limit=10", bad: { url: "/firms?sort=sideways" }, deny: null, calls: "platform_firm_list" },
  { method: "GET", path: "/firms/:id", url: `/firms/${ORG}`, bad: { url: "/firms/not-a-uuid" }, deny: null, calls: "platform_firm_detail", rpcs: { platform_firm_detail: { firm: { id: ORG } } } },
  { method: "GET", path: "/firms/:id/verification", url: `/firms/${ORG}/verification`, bad: { url: "/firms/x/verification" }, deny: null, calls: "platform_credential_detail", rpcs: { platform_firm_detail: { firm: { id: ORG, display_name: "A", verification_status: "verified" }, credentials: [{ id: ID }] }, platform_credential_detail: credential } },
  // subscriptions
  { method: "GET", path: "/subscriptions/exceptions", url: "/subscriptions/exceptions?reason=past_due", bad: { url: "/subscriptions/exceptions?reason=broke" }, deny: null, calls: "platform_subscription_exceptions" },
  // licences
  { method: "GET", path: "/licences/queue", url: "/licences/queue?kind=adverse", bad: { url: "/licences/queue?kind=soon" }, deny: null, calls: "platform_licence_queue" },
  { method: "GET", path: "/licences/credentials/:id", url: `/licences/credentials/${ID}`, bad: { url: "/licences/credentials/1" }, deny: null, calls: "platform_credential_detail", rpcs: { platform_credential_detail: credential } },
  { method: "POST", path: "/licences/credentials/:id/checks", url: `/licences/credentials/${ID}/checks`, body: goodCheck, bad: { url: `/licences/credentials/${ID}/checks`, body: { ...goodCheck, sourceUrl: "https://example.com/x" } }, deny: "viewer", calls: "record_licence_check", on: "user", session: "fresh", rpcs: { platform_credential_detail: credential } },
  { method: "POST", path: "/licences/credentials/:id/cicc-check", url: `/licences/credentials/${ID}/cicc-check`, body: {}, bad: { url: "/licences/credentials/nope/cicc-check", body: {} }, deny: "viewer", calls: "check_licence_against_cicc_list", rpcs: { platform_credential_detail: credential, check_licence_against_cicc_list: ID } },
  { method: "GET", path: "/licences/cicc-imports", url: "/licences/cicc-imports", bad: { url: "/licences/cicc-imports?limit=999" }, deny: null, calls: "platform_cicc_imports" },
  { method: "POST", path: "/licences/cicc-imports", url: "/licences/cicc-imports", body: { sourceNote: "Downloaded from CICC", fileName: "list.csv", csv, dryRun: false }, bad: { url: "/licences/cicc-imports", body: { sourceNote: "", fileName: "x.csv", csv } }, deny: "viewer", calls: "finish_cicc_register_import", rpcs: { start_cicc_register_import: ID, import_cicc_register: 2, finish_cicc_register_import: { checked: 1 } } },
  // support
  { method: "GET", path: "/support/requests", url: "/support/requests?state=active", bad: { url: "/support/requests?state=open" }, deny: null, calls: "platform_support_requests" },
  { method: "GET", path: "/support/requests/:id", url: `/support/requests/${ID}`, bad: { url: "/support/requests/zz" }, deny: null, calls: "platform_support_request_history", tables: { support_access_requests: [{ id: ID, organization_id: ORG, status: "pending" }] } },
  { method: "POST", path: "/support/requests", url: "/support/requests", status: 201, body: { organizationId: ORG, scope: "firm_settings", requesterName: "Ops", reason: "Firm asked for help with billing settings", minutes: 60, confirmFirmNotified: true }, bad: { url: "/support/requests", body: { organizationId: ORG, scope: "matter_all", requesterName: "Ops", reason: "Firm asked for help", minutes: 60, confirmFirmNotified: true } }, deny: "viewer", calls: "create_support_access_request", rpcs: { create_support_access_request: ID } },
  { method: "POST", path: "/support/requests/:id/cancel", url: `/support/requests/${ID}/cancel`, body: { reason: "Not needed" }, bad: { url: `/support/requests/${ID}/cancel`, body: { reason: "" } }, deny: "viewer", calls: "cancel_support_access_request", tables: { support_access_requests: [{ id: ID, organization_id: ORG, status: "pending" }] } },
  // notices
  { method: "GET", path: "/notices", url: "/notices?status=published", bad: { url: "/notices?status=gone" }, deny: null, calls: "", tables: { service_notices: [notice] } },
  { method: "GET", path: "/notices/:id", url: `/notices/${ID}`, bad: { url: "/notices/1" }, deny: null, calls: "platform_audit_log", tables: { service_notices: [notice] } },
  { method: "POST", path: "/notices", url: "/notices", status: 201, body: { kind: "incident", severity: "major", title: "Slow uploads", body: "We are looking into it.", audience: "all" }, bad: { url: "/notices", body: { kind: "maintenance", title: "Window", body: "x", audience: "all" } }, deny: "viewer", calls: "post_service_notice", rpcs: { post_service_notice: ID }, tables: { service_notices: [notice] } },
  { method: "PATCH", path: "/notices/:id", url: `/notices/${ID}`, body: { title: "Uploads slow in Ontario" }, bad: { url: `/notices/${ID}`, body: { title: "x" } }, deny: "viewer", calls: "update_service_notice", tables: { service_notices: [notice] } },
  { method: "POST", path: "/notices/:id/resolve", url: `/notices/${ID}/resolve`, body: { resolutionNote: "Fixed the queue" }, bad: { url: `/notices/${ID}/resolve`, body: { resolutionNote: "" } }, deny: "viewer", calls: "resolve_service_notice", tables: { service_notices: [notice] } },
  // health
  { method: "GET", path: "/health", url: "/health", bad: { url: "/health" }, deny: null, calls: "platform_outbox_health" },
  { method: "GET", path: "/health/dead-letters", url: "/health/dead-letters?eventType=support_access.requested", bad: { url: "/health/dead-letters?offset=-1" }, deny: null, calls: "platform_dead_letters" },
  { method: "GET", path: "/health/dead-letters/:id", url: `/health/dead-letters/${ID}`, bad: { url: "/health/dead-letters/1" }, deny: null, calls: "platform_outbox_event", rpcs: { platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } } },
  { method: "POST", path: "/health/dead-letters/:id/retry", url: `/health/dead-letters/${ID}/retry`, body: { reason: "Email provider recovered" }, bad: { url: `/health/dead-letters/${ID}/retry`, body: { reason: "short" } }, deny: "viewer", calls: "platform_replay_outbox_event", on: "user", session: "fresh", rpcs: { platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } } },
  // templates
  { method: "GET", path: "/templates", url: "/templates", bad: { url: "/templates" }, deny: null, calls: "platform_template_queue" },
  { method: "GET", path: "/templates/official-domains", url: "/templates/official-domains", bad: { url: "/templates/official-domains" }, deny: null, calls: "", tables: { official_source_domains: [{ host: "canada.ca" }] } },
  { method: "GET", path: "/templates/history/:key", url: "/templates/history/study_permit", bad: { url: "/templates/history/Bad-Key" }, deny: null, calls: "shared_template_history" },
  { method: "GET", path: "/templates/versions/:id", url: `/templates/versions/${ID}`, bad: { url: "/templates/versions/1" }, deny: null, calls: "shared_template_diff", rpcs: { platform_template_version: version() } },
  { method: "POST", path: "/templates/drafts", url: "/templates/drafts", status: 201, body: goodDraft, bad: { url: "/templates/drafts", body: { ...goodDraft, stableKey: "Study Permit" } }, deny: "viewer", calls: "set_shared_template_version_sources", rpcs: { draft_shared_template_version: ID, platform_template_version: version("draft", ME) } },
  { method: "PATCH", path: "/templates/versions/:id", url: `/templates/versions/${ID}`, body: reviseBody, bad: { url: `/templates/versions/${ID}`, body: { ...goodDraft, items: [] } }, deny: "viewer", calls: "revise_shared_template_draft", rpcs: { platform_template_version: version("draft", ME) } },
  { method: "POST", path: "/templates/versions/:id/approve", url: `/templates/versions/${ID}/approve`, body: { confirmCompared: true, code: "123456" }, bad: { url: `/templates/versions/${ID}/approve`, body: { confirmCompared: false } }, deny: "viewer", calls: "approve_shared_template_version", on: "user", session: "fresh", reviewer: true, rpcs: { platform_template_version: version("published") } },
  { method: "POST", path: "/templates/versions/:id/reject", url: `/templates/versions/${ID}/reject`, body: { reason: "Missing the biometrics step" }, bad: { url: `/templates/versions/${ID}/reject`, body: { reason: "" } }, deny: "viewer", calls: "reject_shared_template_version", on: "user", session: "fresh", reviewer: true, rpcs: { platform_template_version: version("rejected") } },
  { method: "POST", path: "/templates/versions/:id/rollback", url: `/templates/versions/${ID}/rollback`, body: { reason: "Wrong fee amount" }, bad: { url: `/templates/versions/${ID}/rollback`, body: {} }, deny: "viewer", calls: "rollback_shared_template_version", on: "user", session: "fresh", reviewer: true, rpcs: { platform_template_version: version("withdrawn") } },
  // audit
  { method: "GET", path: "/audit", url: "/audit?actionPrefix=admin_portal.&limit=20", bad: { url: `/audit?beforeAt=2026-10-29T00:00:00Z` }, deny: null, calls: "platform_audit_log" },
  // admins
  { method: "GET", path: "/admins", url: "/admins", bad: { url: "/admins" }, deny: "operator", calls: "platform_admin_list" },
  { method: "POST", path: "/admins/invites", url: "/admins/invites", status: 201, body: { email: "new@mail.grokbot.com", role: "viewer" }, bad: { url: "/admins/invites", body: { email: "nope", role: "viewer" } }, deny: "operator", calls: "platform_admin_invite", on: "user", session: "fresh", rpcs: { platform_admin_invite: ID } },
  { method: "POST", path: "/admins/invites/:id/cancel", url: `/admins/invites/${ID}/cancel`, body: {}, bad: { url: "/admins/invites/x/cancel", body: {} }, deny: "operator", calls: "platform_admin_cancel_invite", on: "user", session: "fresh" },
  { method: "PATCH", path: "/admins/:id/role", url: `/admins/${OTHER}/role`, body: { role: "operator" }, bad: { url: `/admins/${OTHER}/role`, body: { role: "god" } }, deny: "operator", calls: "platform_admin_set_role", on: "user", session: "fresh" },
  { method: "PATCH", path: "/admins/:id/reviewer", url: `/admins/${OTHER}/reviewer`, body: { templateReviewer: true }, bad: { url: `/admins/${OTHER}/reviewer`, body: { templateReviewer: "maybe" } }, deny: "operator", calls: "platform_admin_set_reviewer", on: "user", session: "fresh" },
  { method: "POST", path: "/admins/:id/remove", url: `/admins/${OTHER}/remove`, body: { reason: "Left the team", confirmEmail: "ops@mail.grokbot.com" }, bad: { url: `/admins/${OTHER}/remove`, body: { reason: "x", confirmEmail: "ops@mail.grokbot.com" } }, deny: "operator", calls: "platform_admin_remove", on: "user", session: "fresh", rpcs: { platform_admin_list: { admins: [{ user_id: OTHER, email: "ops@mail.grokbot.com" }] } } },
];

describe("endpoint coverage", () => {
  it("has a case for every registered endpoint", () => {
    const registered = ENDPOINTS.map((e) => `${e.method} ${e.path}`).sort();
    const covered = CASES.map((c) => `${c.method} ${c.path}`).sort();
    expect(covered).toEqual(registered);
  });
  it("gives every mutation an audit action and every endpoint a summary", () => {
    for (const e of ENDPOINTS) {
      expect(e.summary.length, `${e.method} ${e.path}`).toBeGreaterThan(10);
      if (e.method !== "GET") expect(e.audit?.action, `${e.method} ${e.path}`).toBeTruthy();
    }
  });
});

describe.each(CASES)("$method $path", (c) => {
  const mutation = c.method !== "GET";
  const happyDeps = () =>
    deps({ role: c.role === undefined ? "owner" : c.role, session: c.session, templateReviewer: c.reviewer, db: fakeDb(c.rpcs ?? {}, c.tables ?? {}), userDb: fakeDb(c.rpcs ?? {}) });

  it("refuses an unauthorised caller", async () => {
    const d = c.deny
      ? deps({ role: c.deny, session: "fresh", templateReviewer: c.reviewer, db: fakeDb(c.rpcs ?? {}, c.tables ?? {}) })
      : deps({ denied: new AdminDenied("no_access_jwt", "no Access session") });
    const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
    const json = (await res.json()) as { error: { code: string; requestId: string } };
    expect(res.status).toBe(c.deny ? 403 : 401);
    expect(json.error.code).toBe(c.deny ? "forbidden" : "unauthenticated");
    expect(json.error.requestId).toBe("req-1");
    const writes = [...d.db.calls, ...d.userDb.calls].filter((x) => x.fn !== "platform_admin_record_audit");
    expect(writes).toEqual([]);
    if (c.deny && mutation) expect(auditCalls(d.db)[0]?.args).toMatchObject({ p_result: "denied", p_actor: ME });
  });

  it("validates its input", async () => {
    const same = c.bad.url === c.url && JSON.stringify(c.bad.body) === JSON.stringify(c.body);
    if (same) return; // takes no input
    const d = happyDeps();
    const res = await handle(req(c.method, c.bad.url, c.bad.body), ENDPOINTS, d);
    const json = (await res.json()) as { error: { code: string; details?: { issues: unknown[] } } };
    expect(res.status).toBe(422);
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.details?.issues.length).toBeGreaterThan(0);
    expect([...d.db.calls, ...d.userDb.calls].filter((x) => !["platform_admin_record_audit"].includes(x.fn)).length).toBe(0);
  });

  it("succeeds on the happy path", async () => {
    const d = happyDeps();
    const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
    const json = (await res.json()) as { data: unknown; requestId: string; error?: unknown };
    expect(json.error).toBeUndefined();
    expect(res.status).toBe(c.status ?? 200);
    expect(json.requestId).toBe("req-1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    if (c.calls) {
      const client = c.on === "user" ? d.userDb : d.db;
      expect(client.calls.map((x) => x.fn)).toContain(c.calls);
      if (c.on === "user") expect(d.db.calls.map((x) => x.fn)).not.toContain(c.calls);
    }
    if (mutation) {
      const audit = auditCalls(d.db);
      expect(audit).toHaveLength(1);
      expect(audit[0].args).toMatchObject({ p_actor: ME, p_result: "success" });
      expect(String(audit[0].args.p_action)).toMatch(/^admin_portal\./);
      expect((audit[0].args.p_context as Record<string, unknown>).request_id).toBe("req-1");
    } else {
      expect(auditCalls(d.db)).toHaveLength(0);
    }
  });
});
