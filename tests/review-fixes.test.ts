import { beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { parseReservation, rpcAttemptStore } from "@/lib/lockout";
import { SessionError } from "@/lib/session";
import { auditResultLabel, isStartedAudit } from "@/client/records";
import { ID, ME, ORG, ORIGIN, auditCalls, caller, deps, fakeDb, req } from "./api-helpers";

type Body = { data?: Record<string, unknown>; error?: { code: string; message: string; requestId?: string } };
const body = (res: Response) => res.json() as Promise<Body>;

// ------------------------------------------------------------------------------------------------ lockout store

describe("F1: database attempt store", () => {
  it("reserves and resolves through the service-role functions with the admin's user id", async () => {
    const db = fakeDb({
      platform_admin_reserve_attempt: { allowed: true, attempt_id: ID, retry_after_seconds: 0 },
      platform_admin_resolve_attempt: null,
    });
    const c = caller("owner", db) as Parameters<typeof rpcAttemptStore.reserve>[0];
    expect(await rpcAttemptStore.reserve(c, "password")).toEqual({ allowed: true, attemptId: ID, retryAfterSeconds: 0 });
    await rpcAttemptStore.resolve(c, ID, false);
    expect(db.calls).toEqual([
      { fn: "platform_admin_reserve_attempt", args: { p_user: ME, p_kind: "password" } },
      { fn: "platform_admin_resolve_attempt", args: { p_attempt: ID, p_succeeded: false } },
    ]);
  });

  it("refuses when the database refuses, and throws (fail closed) on errors or malformed answers", async () => {
    expect(parseReservation({ allowed: false, attempt_id: null, retry_after_seconds: 420 })).toEqual({ allowed: false, attemptId: null, retryAfterSeconds: 420 });
    expect(parseReservation({ allowed: false }).retryAfterSeconds).toBe(900);
    for (const bad of [null, {}, { allowed: "yes" }, { allowed: true }, { allowed: true, attempt_id: "not-a-uuid" }]) {
      expect(() => parseReservation(bad), JSON.stringify(bad)).toThrow();
    }
    const db = fakeDb({ platform_admin_reserve_attempt: { error: { code: "42501", message: "permission denied" } } });
    await expect(rpcAttemptStore.reserve(caller("owner", db) as never, "mfa")).rejects.toThrow();
  });
});

// ------------------------------------------------------------------------------------------------ F5 started rows

describe("F5: the started audit row", () => {
  it("names the invite on the started and outcome rows of accept-invite, marked phase started", async () => {
    const d = deps({ role: null, session: "fresh", userDb: fakeDb({ accept_platform_admin_invite: { accepted: true } }) });
    const res = await handle(req("POST", "/session/accept-invite", { confirm: true }), ENDPOINTS, d);
    expect(res.status).toBe(200);
    const rows = auditCalls(d.db).map((c) => c.args);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ p_action: "admin_portal.admins.invite_accepted.started", p_result: "success", p_object_id: ID, p_context: { phase: "started" } });
    expect(rows[1]).toMatchObject({ p_action: "admin_portal.admins.invite_accepted", p_result: "success", p_object_id: ID });
    expect((rows[1].p_context as Record<string, unknown>).phase).toBeUndefined();
  });

  it("names the invite even when the request is refused before the handler", async () => {
    const d = deps({ role: null, session: "none" });
    expect((await handle(req("POST", "/session/accept-invite", { confirm: true }), ENDPOINTS, d)).status).toBe(401);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied", p_object_id: ID });
  });

  it("shows started rows as started, not as a success", () => {
    const started = { action: "admin_portal.health.replay.started", result: "success", context: { phase: "started" } };
    expect(isStartedAudit(started)).toBe(true);
    expect(auditResultLabel(started)).toEqual({ label: "started", tone: "neutral" });
    expect(auditResultLabel({ action: "admin_portal.health.replay.started", result: "success" }).label).toBe("started");
    expect(auditResultLabel({ action: "admin_portal.health.replay", result: "success", context: {} })).toEqual({ label: "success", tone: "ok" });
    expect(auditResultLabel({ action: "admin_portal.health.replay", result: "denied" }).tone).toBe("warn");
  });
});

// ------------------------------------------------------------------------------------------------ F6 internal detail

describe("F6: re-wrapped database errors keep their server-side detail", () => {
  it("logs the database detail when a CICC import chunk fails", async () => {
    const d = deps({
      role: "operator",
      session: "fresh",
      db: fakeDb({ start_cicc_register_import: ID, import_cicc_register: { error: { code: "XX000", message: "chunk-detail-for-log" } } }),
      userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }),
    });
    const csv = "Licence Number,Name,Status\nR500001,Test Person,Active\n";
    const res = await handle(req("POST", "/licences/cicc-imports", { sourceNote: "Downloaded from CICC", fileName: "list.csv", csv, dryRun: false }), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await body(res))).not.toMatch(/chunk-detail-for-log/);
    expect(d.logs).toContainEqual({ message: "admin api upstream error", extra: expect.objectContaining({ detail: expect.stringMatching(/chunk-detail-for-log/) }) });
  });

  it("logs the database detail when template sources cannot be saved", async () => {
    const version = { version: { id: ID, template_id: ID, stable_key: "study_permit", status: "draft", author_user_id: ME }, sources: [{ official: true }], reviews: [] };
    const d = deps({
      db: fakeDb({ draft_shared_template_version: ID, platform_template_version: version, set_shared_template_version_sources: { error: { code: "XX000", message: "sources-detail-for-log" } } }),
    });
    const draft = {
      stableKey: "study_permit",
      authorName: "Ops",
      title: "Study permit checklist",
      summary: "",
      items: ["Passport"],
      testEvidence: "Compared with IRCC page on 2026-10-29",
      effectiveOn: "2026-11-01",
      changelog: "First version",
      sources: [{ url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html" }],
    };
    const res = await handle(req("POST", "/templates/drafts", draft), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect((await body(res)).error?.message).toMatch(/sources were not saved/);
    expect(d.logs).toContainEqual({ message: "admin api upstream error", extra: expect.objectContaining({ detail: expect.stringMatching(/sources-detail-for-log/) }) });
  });
});

// ------------------------------------------------------------------------------------------------ F7 early failures

describe("F7: body and session-status failures get the normal error body and audit row", () => {
  it("handles a request body that cannot be read", async () => {
    const d = deps({ db: fakeDb({ post_service_notice: ID }) });
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("body stream broke"));
      },
    });
    const request = new Request(`${ORIGIN}/api/admin/notices`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    const res = await handle(request, ENDPOINTS, d);
    expect(res.status).toBe(500);
    expect((await body(res)).error).toMatchObject({ code: "internal", requestId: "req-1" });
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.notices.posted", p_result: "failure" });
    expect(d.db.calls.map((c) => c.fn)).not.toContain("post_service_notice");
  });

  it("handles a session status that throws", async () => {
    const d = deps({
      status: async () => {
        throw new Error("cookie store broke");
      },
    });
    const res = await handle(req("POST", "/session/step-up", { code: "123456" }), ENDPOINTS, d);
    expect(res.status).toBe(500);
    expect((await body(res)).error?.code).toBe("internal");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.session.step_up", p_result: "failure" });
    expect(d.sessionCalls).toEqual([]);

    const unavailable = deps({
      status: async () => {
        throw new SessionError("unavailable", "The Worker has no SUPABASE_PUBLISHABLE_KEY");
      },
    });
    const res2 = await handle(req("POST", "/session/step-up", { code: "123456" }), ENDPOINTS, unavailable);
    expect(res2.status).toBe(502);
    expect((await body(res2)).error?.message).not.toMatch(/SUPABASE/);
    expect(auditCalls(unavailable.db)).toHaveLength(1);
  });
});

// ------------------------------------------------------------------------------------------------ F8 dropped session

const jar = new Map<string, string>();
const auth = { setSession: vi.fn(), signOut: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      if (value) jar.set(name, value);
      else jar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));

describe("F8: a session dropped for its absolute lifetime is also signed out", () => {
  const sessionCaller = { env: caller("owner", fakeDb()).env, email: "admin@casevoya.ca", userId: ME };
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    jar.clear();
    auth.setSession.mockReset().mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("revokes the Supabase session and clears the cookie", async () => {
    const { SESSION_COOKIE, sessionStatus } = await import("@/lib/session");
    jar.set(SESSION_COOKIE, JSON.stringify({ a: "access", r: "refresh", x: now - 10 }));
    const status = await sessionStatus(sessionCaller);
    expect(status.signedIn).toBe(false);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("is best effort: a failing revocation still reports signed out", async () => {
    const { SESSION_COOKIE, sessionStatus } = await import("@/lib/session");
    auth.setSession.mockRejectedValue(new Error("network down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    jar.set(SESSION_COOKIE, JSON.stringify({ a: "access", r: "refresh" }));
    expect((await sessionStatus(sessionCaller)).signedIn).toBe(false);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    spy.mockRestore();
  });

  it("leaves a live session alone", async () => {
    const { SESSION_COOKIE, sessionStatus } = await import("@/lib/session");
    jar.set(SESSION_COOKIE, JSON.stringify({ a: "access", r: "refresh", x: now + 600 }));
    await sessionStatus(sessionCaller);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(jar.has(SESSION_COOKIE)).toBe(true);
  });
  void ORG;
});
