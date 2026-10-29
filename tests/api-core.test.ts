import { describe, expect, it } from "vitest";
import { handle, matchPath } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { fromDbError } from "@/lib/api/errors";
import { AdminDenied } from "@/lib/guard";
import { describeToken, stepUpIsFresh } from "@/lib/session";
import { phaseOf } from "@/lib/api/modules/notices";
import { durationMinutes } from "@/lib/api/modules/incidents";
import { readCiccCsv, CsvError } from "@/lib/api/cicc-csv";
import { sourcesForDb, torontoToday } from "@/lib/templates";
import { ID, ME, NOW, ORG, auditCalls, deps, fakeDb, req } from "./api-helpers";

const body = (res: Response) => res.json() as Promise<{ data?: unknown; error?: { code: string; message: string; details?: unknown; requestId: string } }>;

describe("routing", () => {
  it("404s unknown paths and 405s wrong methods with Allow", async () => {
    const d = deps({});
    const a = await handle(req("GET", "/nope"), ENDPOINTS, d);
    expect(a.status).toBe(404);
    expect((await body(a)).error?.code).toBe("not_found");
    const b = await handle(req("DELETE", "/notices"), ENDPOINTS, d);
    expect(b.status).toBe(405);
    expect(b.headers.get("allow")).toContain("GET");
  });
  it("matches params and refuses malformed escapes", () => {
    expect(matchPath("/firms/:id", "/firms/abc")).toEqual({ id: "abc" });
    expect(matchPath("/firms/:id", "/firms/%E0%A4%A")).toBeNull();
    expect(matchPath("/firms/:id", "/firms/a/b")).toBeNull();
  });
});

describe("gate", () => {
  it.each([
    ["no_access_jwt", 401, "unauthenticated"],
    ["bad_access_jwt", 401, "unauthenticated"],
    ["email_not_allowed", 403, "forbidden"],
    ["no_auth_user", 403, "forbidden"],
    ["not_platform_admin", 403, "forbidden"],
    ["config", 500, "internal"],
    ["lookup_failed", 502, "upstream_error"],
  ] as const)("maps %s to %i %s", async (reason, status, code) => {
    const res = await handle(req("GET", "/overview"), ENDPOINTS, deps({ denied: new AdminDenied(reason, "x") }));
    expect(res.status).toBe(status);
    expect((await body(res)).error?.code).toBe(code);
  });
  it("keeps an invitee out of everything except the session endpoints", async () => {
    const d = deps({ role: null });
    expect((await handle(req("GET", "/overview"), ENDPOINTS, d)).status).toBe(403);
    expect((await handle(req("GET", "/session/invite"), ENDPOINTS, d)).status).toBe(200);
  });
  it("refuses accept-invite from someone who is already an admin", async () => {
    const res = await handle(req("POST", "/session/accept-invite", { confirm: true }), ENDPOINTS, deps({ role: "viewer", session: "fresh" }));
    expect(res.status).toBe(409);
  });
});

describe("CSRF", () => {
  it("refuses a mutation without the portal Origin, and audits the refusal", async () => {
    const d = deps({});
    const res = await handle(req("POST", "/notices", { kind: "info" }, { origin: "https://evil.example" }), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe("csrf_failed");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied", p_action: "admin_portal.notices.posted" });
  });
  it("refuses a form-encoded mutation", async () => {
    const res = await handle(req("POST", "/notices", "kind=info", { "content-type": "application/x-www-form-urlencoded" }), ENDPOINTS, deps({}));
    expect((await body(res)).error?.code).toBe("csrf_failed");
  });
  it("rejects a body that is not JSON", async () => {
    const res = await handle(req("POST", "/notices", "{oops"), ENDPOINTS, deps({}));
    expect(res.status).toBe(422);
  });
  it("does not check Origin on reads", async () => {
    const res = await handle(req("GET", "/overview", undefined, { origin: "https://evil.example" }), ENDPOINTS, deps({}));
    expect(res.status).toBe(200);
  });
});

describe("own session and step-up", () => {
  const retry = (code?: string) => req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered", ...(code ? { code } : {}) });
  const db = () => fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } });
  it("asks for a sign-in when there is no session", async () => {
    const res = await handle(retry(), ENDPOINTS, deps({ session: "none", db: db() }));
    expect(res.status).toBe(401);
    expect((await body(res)).error?.code).toBe("session_required");
  });
  it("asks for a sign-in when the session is another user", async () => {
    const res = await handle(retry(), ENDPOINTS, deps({ session: "other", db: db() }));
    expect((await body(res)).error?.code).toBe("session_required");
  });
  it("asks for a code when the step-up is older than 15 minutes", async () => {
    const d = deps({ session: "stale", db: db() });
    const res = await handle(retry(), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe("step_up_required");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied" });
  });
  it("steps up with the code in the body even when stale", async () => {
    const d = deps({ session: "stale", db: db() });
    const res = await handle(retry("123456"), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.sessionCalls).toContain("client:123456");
    expect(d.userDb.calls[0]).toMatchObject({ fn: "platform_replay_outbox_event", args: { p_event_id: ID, p_reason: "Provider recovered" } });
  });
  it("passes database step-up refusals through as step_up_required and audits a denial", async () => {
    const d = deps({ session: "fresh", db: db(), userDb: fakeDb({ platform_replay_outbox_event: { error: { code: "42501", message: "step-up is required" } } }) });
    const res = await handle(retry(), ENDPOINTS, d);
    expect((await body(res)).error?.code).toBe("step_up_required");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied", p_object_id: ID, p_organization_id: ORG });
  });
  it("reports a database validation refusal as 422 and audits a failure", async () => {
    const d = deps({ session: "fresh", db: db(), userDb: fakeDb({ platform_replay_outbox_event: { error: { code: "22023", message: "only a dead-lettered event can be retried" } } }) });
    const res = await handle(retry(), ENDPOINTS, d);
    expect(res.status).toBe(422);
    expect((await body(res)).error?.message).toMatch(/dead-lettered/);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "failure" });
  });
});

describe("reviewer flag", () => {
  it("refuses approve without the template reviewer flag before touching the database", async () => {
    const d = deps({ role: "owner", session: "fresh", templateReviewer: false });
    const res = await handle(req("POST", `/templates/versions/${ID}/approve`, { confirmCompared: true }), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect(d.userDb.calls).toEqual([]);
  });
  it("only lets the author revise a draft", async () => {
    const d = deps({ db: fakeDb({ platform_template_version: { version: { id: ID, status: "draft", author_user_id: "someone-else" }, sources: [], reviews: [] } }) });
    const res = await handle(
      req("PATCH", `/templates/versions/${ID}`, { title: "T", items: ["a"], testEvidence: "evidence ok", effectiveOn: "2026-11-01", changelog: "chg", sources: [{ url: "https://www.canada.ca/x" }] }),
      ENDPOINTS,
      d,
    );
    expect(res.status).toBe(403);
    expect(d.db.calls.map((c) => c.fn)).not.toContain("revise_shared_template_draft");
  });
});

describe("audit write", () => {
  it("still returns success when the audit write fails after the action", async () => {
    const d = deps({ db: fakeDb({ post_service_notice: ID, platform_admin_record_audit: { error: { code: "XX000", message: "down" } } }, { service_notices: [{ id: ID, status: "draft", starts_at: null, ends_at: null, audience: "all" }] }) });
    const res = await handle(req("POST", "/notices", { kind: "info", title: "Heads up", body: "New feature", audience: "all", publish: false }), ENDPOINTS, d);
    expect(res.status).toBe(201);
  });
  it("names the actor, object, firm and request in the entry", async () => {
    const d = deps({ db: fakeDb({ create_support_access_request: ID }) });
    await handle(
      req("POST", "/support/requests", { organizationId: ORG, scope: "firm_settings", requesterName: "Ops", reason: "Billing settings help", confirmFirmNotified: true }),
      ENDPOINTS,
      d,
    );
    expect(auditCalls(d.db)[0].args).toMatchObject({
      p_actor: ME,
      p_action: "admin_portal.support.request_created",
      p_object_table: "public.support_access_requests",
      p_object_id: ID,
      p_organization_id: ORG,
      p_result: "success",
    });
    expect(d.db.calls.find((c) => c.fn === "create_support_access_request")?.args).toMatchObject({ p_requested_by_user_id: ME, p_minutes: 60 });
  });
});

describe("module rules", () => {
  it("dry-runs a CICC import without sending rows", async () => {
    const d = deps({});
    const res = await handle(req("POST", "/licences/cicc-imports", { sourceNote: "From CICC", fileName: "l.csv", csv: "Licence Number,Name,Status\nR1,A,Active\nR2,B,Lapsed\n,C,Active\n" }), ENDPOINTS, d);
    const out = (await body(res)).data as { dryRun: boolean; summary: { rows: number; skippedWithoutNumber: number; unrecognisedStatuses: string[] } };
    expect(out.dryRun).toBe(true);
    expect(out.summary).toMatchObject({ rows: 2, skippedWithoutNumber: 1, unrecognisedStatuses: ["Lapsed"] });
    expect(d.db.calls.map((c) => c.fn)).not.toContain("start_cicc_register_import");
  });
  it("refuses a CSV without the required columns", () => {
    expect(() => readCiccCsv("Foo,Bar\n1,2\n")).toThrow(CsvError);
    expect(() => readCiccCsv('Licence Number,Name,Status\n"R1,A,Active\n')).toThrow(/quoted/);
  });
  it("sends a listed-firm notice with its firms and an all-firm notice with none", async () => {
    const d = deps({ db: fakeDb({ post_service_notice: ID }, { service_notices: [{ id: ID, status: "published", audience: "listed", starts_at: null, ends_at: null }] }) });
    await handle(req("POST", "/notices", { kind: "incident", title: "Slow", body: "x", audience: "listed", organizationIds: [ORG] }), ENDPOINTS, d);
    expect(d.db.calls.find((c) => c.fn === "post_service_notice")?.args).toMatchObject({ p_organization_ids: [ORG], p_acting_admin: ME, p_publish: true });
    const bad = await handle(req("POST", "/notices", { kind: "incident", title: "Slow", body: "x", audience: "listed" }), ENDPOINTS, deps({}));
    expect(bad.status).toBe(422);
  });
  it("freezes resolved notices", async () => {
    const d = deps({ db: fakeDb({}, { service_notices: [{ id: ID, status: "resolved", audience: "all" }] }) });
    const res = await handle(req("PATCH", `/notices/${ID}`, { title: "New title" }), ENDPOINTS, d);
    expect(res.status).toBe(409);
  });
  it("derives a notice phase", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(phaseOf({ status: "draft", starts_at: null, ends_at: null }, now)).toBe("draft");
    expect(phaseOf({ status: "published", starts_at: "2026-10-30T00:00:00Z", ends_at: null }, now)).toBe("scheduled");
    expect(phaseOf({ status: "published", starts_at: null, ends_at: "2026-10-29T11:00:00Z" }, now)).toBe("ended");
    expect(phaseOf({ status: "published", starts_at: null, ends_at: null }, now)).toBe("live");
    expect(phaseOf({ status: "resolved", starts_at: null, ends_at: null }, now)).toBe("resolved");
  });
  it("requires the typed email to match before removing an admin", async () => {
    const d = deps({ session: "fresh", db: fakeDb({ platform_admin_list: { admins: [{ user_id: ID, email: "a@mail.grokbot.com" }] } }) });
    const res = await handle(req("POST", `/admins/${ID}/remove`, { reason: "Left", confirmEmail: "b@mail.grokbot.com" }), ENDPOINTS, d);
    expect(res.status).toBe(422);
    expect(d.userDb.calls).toEqual([]);
  });
  it("tells the owner what to do after an invite (no email is sent)", async () => {
    const d = deps({ session: "fresh", userDb: fakeDb({ platform_admin_invite: ID }) });
    const res = await handle(req("POST", "/admins/invites", { email: "New@mail.grokbot.com", role: "operator" }), ENDPOINTS, d);
    const out = (await body(res)).data as { accessReady: boolean; nextSteps: string[] };
    expect(out.accessReady).toBe(false);
    expect(out.nextSteps.join(" ")).toMatch(/ADMIN_ALLOWED_EMAILS/);
    expect(d.userDb.calls[0].args).toMatchObject({ p_email: "new@mail.grokbot.com", p_days: 7, p_template_reviewer: false });
  });
  it("computes support effective status for an approved grant past its end", async () => {
    const d = deps({ db: fakeDb({ platform_support_request_history: { events: [], uses: [] } }, { support_access_requests: [{ id: ID, organization_id: ORG, status: "approved", ends_at: "2020-01-01T00:00:00Z", ended_at: null }] }) });
    const res = await handle(req("GET", `/support/requests/${ID}`), ENDPOINTS, d);
    expect(((await body(res)).data as { request: { effective_status: string } }).request.effective_status).toBe("expired");
  });
});

describe("errors and helpers", () => {
  it("maps database codes", () => {
    expect(fromDbError({ code: "42501", message: "a licence check requires a recent step-up" }).code).toBe("step_up_required");
    expect(fromDbError({ code: "42501", message: "your platform role does not allow this" }).code).toBe("forbidden");
    expect(fromDbError({ code: "23505", message: "an invite for that email is already open" }).code).toBe("conflict");
    expect(fromDbError({ code: "P0002", message: "event not found" }).code).toBe("not_found");
    expect(fromDbError({ code: "PGRST202", message: "x" }).code).toBe("upstream_error");
  });
  it("reads step-up freshness from the token amr", () => {
    const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
    const fresh = describeToken(token({ sub: ME, aal: "aal2", exp: NOW + 600, amr: [{ method: "password", timestamp: NOW - 100 }, { method: "totp", timestamp: NOW - 60 }] }), ME);
    expect(fresh.stepUpAt).toBe(NOW - 60);
    expect(stepUpIsFresh(fresh, NOW)).toBe(true);
    expect(stepUpIsFresh(fresh, NOW + 900)).toBe(false);
    const passwordOnly = describeToken(token({ sub: ME, aal: "aal1", amr: [{ method: "password", timestamp: NOW }] }), ME);
    expect(passwordOnly.stepUpAt).toBeNull();
    expect(describeToken(token({ sub: "x" }), ME).matchesAccessUser).toBe(false);
    expect(describeToken(null, ME).signedIn).toBe(false);
  });
  it("titles template sources and dates them in Toronto", () => {
    expect(torontoToday(new Date("2026-10-30T03:00:00Z"))).toBe("2026-10-29");
    expect(sourcesForDb([{ url: "https://www.canada.ca/en/x.html" }], "2026-10-29")).toEqual([
      { url: "https://www.canada.ca/en/x.html", title: "www.canada.ca/en/x.html", retrieved_on: "2026-10-29", note: null },
    ]);
  });
});

describe("designer pages", () => {
  it("returns stubs flagged as gaps", async () => {
    for (const url of ["/releases/app-notes", "/privacy/breaches"]) {
      const res = await handle(req("GET", url), ENDPOINTS, deps({}));
      const out = (await body(res)).data as { items: unknown[]; stub: boolean; gap: string };
      expect(out).toMatchObject({ items: [], stub: true });
      expect(out.gap).toMatch(/No data source yet/);
    }
  });
  it("derives switches from settings with an enabled boolean", async () => {
    const d = deps({ db: fakeDb({}, { product_settings: [{ key: "a.enabled", value: { enabled: true } }, { key: "trial.duration", value: { unit: "days", count: 14 } }] }) });
    const out = (await body(await handle(req("GET", "/config"), ENDPOINTS, d))).data as { switches: { key: string }[]; featureFlags: { stub: boolean } };
    expect(out.switches.map((s) => s.key)).toEqual(["a.enabled"]);
    expect(out.featureFlags.stub).toBe(true);
  });
  it("changes a setting as the owner's own session and audits before/after", async () => {
    const d = deps({ session: "fresh", db: fakeDb({}, { product_settings: [{ key: "trial.duration", value: { unit: "days", count: 14 } }] }) });
    const res = await handle(req("PATCH", "/config/settings/trial.duration", { value: { unit: "days", count: 21 }, reason: "Pilot request" }), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.userDb.calls[0]).toMatchObject({ fn: "set_product_setting", args: { p_key: "trial.duration", p_value: { unit: "days", count: 21 } } });
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.config.setting_changed", p_result: "success" });
    expect((auditCalls(d.db)[0].args as { p_context: Record<string, unknown> }).p_context).toMatchObject({ key: "trial.duration", before: { unit: "days", count: 14 } });
  });
  it("404s an unknown setting without calling the database function", async () => {
    const d = deps({ session: "fresh" });
    const res = await handle(req("PATCH", "/config/settings/nope.key", { value: { enabled: true }, reason: "Try it" }), ENDPOINTS, d);
    expect(res.status).toBe(404);
    expect(d.userDb.calls).toEqual([]);
  });
  it("computes incident duration", () => {
    expect(durationMinutes({ starts_at: "2026-10-29T10:00:00Z", published_at: null, resolved_at: "2026-10-29T11:30:00Z" })).toBe(90);
    expect(durationMinutes({ starts_at: null, published_at: "2026-10-29T10:00:00Z", resolved_at: null })).toBeNull();
  });
});
