import { describe, expect, it } from "vitest";
import { handle } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { ID, ME, ORG, OTHER, auditCalls, deps, fakeDb, outcomeAudits, req, type FakeDb } from "./api-helpers";

/**
 * Publishing service notices and creating / cancelling support access requests write with the service role, so they
 * need the operator's own session with a fresh step-up, proven to the database (platform_step_up_check) first.
 */

type Body = { data?: unknown; error?: { code: string; message: string } };
const body = (res: Response) => res.json() as Promise<Body>;

const draft = { id: ID, status: "draft", starts_at: null, ends_at: null, audience: "all", kind: "info", title: "Heads up" };
const published = { ...draft, status: "published" };
const noticeBody = { kind: "incident", severity: "major", title: "Slow uploads", body: "We are looking into it.", audience: "all" };
const supportBody = { organizationId: ORG, scope: "firm_settings", requesterName: "Ops", reason: "Firm asked for help with billing settings", minutes: 60, confirmFirmNotified: true };
const stepUpOk = { platform_step_up_check: { ok: true, user_id: ME } };

type Case = { name: string; method: "POST" | "PATCH"; url: string; body: Record<string, unknown>; write: string; rpcs?: Record<string, unknown>; tables?: Record<string, Record<string, unknown>[]>; status?: number };

const CASES: Case[] = [
  { name: "post a published notice", method: "POST", url: "/notices", body: { ...noticeBody, publish: true }, write: "post_service_notice", rpcs: { post_service_notice: ID }, tables: { service_notices: [published] }, status: 201 },
  { name: "post a notice (publish defaults to true)", method: "POST", url: "/notices", body: noticeBody, write: "post_service_notice", rpcs: { post_service_notice: ID }, tables: { service_notices: [published] }, status: 201 },
  { name: "publish a draft", method: "PATCH", url: `/notices/${ID}`, body: { publish: true }, write: "update_service_notice", tables: { service_notices: [draft] } },
  { name: "edit a published notice", method: "PATCH", url: `/notices/${ID}`, body: { title: "Uploads slow in Ontario" }, write: "update_service_notice", tables: { service_notices: [published] } },
  { name: "resolve a notice", method: "POST", url: `/notices/${ID}/resolve`, body: { resolutionNote: "Fixed the queue" }, write: "resolve_service_notice", tables: { service_notices: [published] } },
  { name: "create a support request", method: "POST", url: "/support/requests", body: supportBody, write: "create_support_access_request", rpcs: { create_support_access_request: ID }, status: 201 },
  { name: "cancel a support request", method: "POST", url: `/support/requests/${ID}/cancel`, body: { reason: "Not needed" }, write: "cancel_support_access_request", tables: { support_access_requests: [{ id: ID, organization_id: ORG, status: "approved" }] } },
];

const writes = (db: FakeDb, fn: string) => db.calls.filter((c) => c.fn === fn);

describe.each(CASES)("$name", (c) => {
  it("refuses without an own session or with a stale step-up, before any write", async () => {
    for (const session of ["none", "stale", "other"] as const) {
      const d = deps({ role: "operator", session, db: fakeDb(c.rpcs ?? {}, c.tables ?? {}), userDb: fakeDb(stepUpOk) });
      const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
      const json = await body(res);
      expect(json.error?.code, session).toBe(session === "stale" ? "step_up_required" : "session_required");
      expect(writes(d.db, c.write), session).toEqual([]);
      expect(outcomeAudits(d.db)[0].args).toMatchObject({ p_result: "denied", p_actor: ME });
    }
  });

  it("refuses when the database does not confirm the step-up", async () => {
    for (const proof of [{ error: { code: "42501", message: "a fresh MFA step-up is required" } }, { ok: true, user_id: OTHER }, { ok: false, user_id: ME }, null]) {
      const d = deps({ role: "operator", session: "fresh", db: fakeDb(c.rpcs ?? {}, c.tables ?? {}), userDb: fakeDb({ platform_step_up_check: proof }) });
      const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
      expect(res.status).toBe(403);
      expect(writes(d.db, c.write)).toEqual([]);
      expect(d.userDb.calls.map((x) => x.fn)).toEqual(["platform_step_up_check"]);
    }
  });

  it("changes nothing when the started audit row cannot be written", async () => {
    const db = fakeDb({ ...(c.rpcs ?? {}), platform_admin_record_audit: { error: { code: "XX000", message: "audit store down" } } }, c.tables ?? {});
    const d = deps({ role: "operator", session: "fresh", db, userDb: fakeDb(stepUpOk) });
    const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect(writes(d.db, c.write)).toEqual([]);
  });

  it("succeeds with a fresh, database-proven step-up and writes the started row first", async () => {
    const d = deps({ role: "operator", session: "fresh", db: fakeDb(c.rpcs ?? {}, c.tables ?? {}), userDb: fakeDb(stepUpOk) });
    const res = await handle(req(c.method, c.url, c.body), ENDPOINTS, d);
    expect((await body(res)).error).toBeUndefined();
    expect(res.status).toBe(c.status ?? 200);
    expect(d.userDb.calls.map((x) => x.fn)).toEqual(["platform_step_up_check"]);
    expect(writes(d.db, c.write)).toHaveLength(1);
    expect(String(d.db.calls[0].args.p_action)).toMatch(/\.started$/);
    expect(outcomeAudits(d.db)[0].args).toMatchObject({ p_result: "success", p_actor: ME });
  });

  it("accepts an inline authenticator code instead of a fresh step-up (and reserves an attempt)", async () => {
    const d = deps({ role: "operator", session: "stale", badAttempts: 0, db: fakeDb(c.rpcs ?? {}, c.tables ?? {}), userDb: fakeDb(stepUpOk) });
    const res = await handle(req(c.method, c.url, { ...c.body, code: "123456" }), ENDPOINTS, d);
    expect(res.status).toBe(c.status ?? 200);
    expect(d.sessionCalls).toContain("client:123456");
    expect(d.attemptCalls).toEqual(["reserve:mfa", "resolve:true"]);
    expect(writes(d.db, c.write)).toHaveLength(1);
    expect(JSON.stringify(auditCalls(d.db))).not.toContain("123456");
  });
});

describe("notice drafts", () => {
  const draftBody = { kind: "info", title: "Heads up", body: "New feature", audience: "all", publish: false };

  it("saving a draft needs the own session but no step-up", async () => {
    const d = deps({ role: "operator", session: "stale", db: fakeDb({ post_service_notice: ID }, { service_notices: [draft] }), userDb: fakeDb(stepUpOk) });
    const res = await handle(req("POST", "/notices", draftBody), ENDPOINTS, d);
    expect(res.status).toBe(201);
    expect(writes(d.db, "post_service_notice")[0].args).toMatchObject({ p_publish: false, p_acting_admin: ME });
    expect(d.userDb.calls).toEqual([]);
    expect(auditCalls(d.db)).toHaveLength(1);
  });

  it("refuses a draft without an own session", async () => {
    const d = deps({ role: "operator", session: "none", db: fakeDb({ post_service_notice: ID }, { service_notices: [draft] }) });
    const res = await handle(req("POST", "/notices", draftBody), ENDPOINTS, d);
    expect(res.status).toBe(401);
    expect(writes(d.db, "post_service_notice")).toEqual([]);
  });

  it("viewers still cannot post", async () => {
    const d = deps({ role: "viewer", session: "fresh", db: fakeDb({ post_service_notice: ID }) });
    const res = await handle(req("POST", "/notices", { ...draftBody, publish: true }), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect(writes(d.db, "post_service_notice")).toEqual([]);
  });
});
