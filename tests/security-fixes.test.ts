import { describe, expect, it } from "vitest";
import { CODE_LOCKOUT_MINUTES, CODE_MAX_BAD_ATTEMPTS, handle } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { fromDbError, redact } from "@/lib/api/errors";
import { AdminDenied } from "@/lib/guard";
import { SESSION_ABSOLUTE_MAX_SECONDS, SessionError, absoluteExpired, passwordSignInAt } from "@/lib/session";
import { ID, ME, NOW, ORG, OTHER, auditCalls, deps, fakeDb, outcomeAudits, req, type FakeDb } from "./api-helpers";

type Body = { data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };
const body = (res: Response) => res.json() as Promise<Body>;

const csv = "Licence Number,Name,Status\nR500001,Test Person,Active\nR500002,Other Person,Suspended\n";
const importBody = (extra: Record<string, unknown> = {}) => ({ sourceNote: "Downloaded from CICC", fileName: "list.csv", csv, dryRun: false, ...extra });
const importRpcs = { start_cicc_register_import: ID, import_cicc_register: 2, finish_cicc_register_import: { checked: 1 } };
const credential = { credential: { id: ID, organization_id: ORG }, checks: [] };
const SERVICE_WRITES = ["start_cicc_register_import", "import_cicc_register", "finish_cicc_register_import", "check_licence_against_cicc_list"];
const serviceWrites = (db: FakeDb) => db.calls.filter((c) => SERVICE_WRITES.includes(c.fn));
const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

/** Fails audit writes: all of them, or only the outcome rows (after the "started" row). */
function failingAudits(db: FakeDb, which: "all" | "outcome"): FakeDb {
  const original = db.rpc;
  db.rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn === "platform_admin_record_audit" && (which === "all" || !String(args.p_action).endsWith(".started"))) {
      db.calls.push({ fn, args });
      return { data: null, error: { code: "XX000", message: "audit store down" } };
    }
    return original(fn, args);
  };
  return db;
}

// ------------------------------------------------------------------------------------------------ M2 / L1 (proof)

describe("M2: CICC import and re-check need a database-verified step-up", () => {
  it("refuses a real import without a session or with a stale step-up, before any service write", async () => {
    for (const session of ["none", "stale"] as const) {
      const d = deps({ role: "operator", session, db: fakeDb(importRpcs), userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }) });
      const res = await handle(req("POST", "/licences/cicc-imports", importBody()), ENDPOINTS, d);
      expect((await body(res)).error?.code).toBe(session === "none" ? "session_required" : "step_up_required");
      expect(serviceWrites(d.db)).toEqual([]);
      expect(outcomeAudits(d.db)[0].args).toMatchObject({ p_result: "denied" });
    }
  });

  it("refuses when the database does not confirm the step-up (cookie pre-check alone is not enough)", async () => {
    const refusals = [
      { error: { code: "42501", message: "a fresh MFA step-up is required" } },
      { ok: true, user_id: OTHER },
      { ok: false, user_id: ME },
      null,
    ];
    for (const proof of refusals) {
      const d = deps({ role: "operator", session: "fresh", db: fakeDb(importRpcs), userDb: fakeDb({ platform_step_up_check: proof }) });
      const res = await handle(req("POST", "/licences/cicc-imports", importBody()), ENDPOINTS, d);
      expect(res.status).toBe(403);
      expect((await body(res)).error?.code).toBe("step_up_required");
      expect(serviceWrites(d.db)).toEqual([]);
      expect(d.userDb.calls.map((c) => c.fn)).toEqual(["platform_step_up_check"]);
    }
  });

  it("imports after the proof, naming the importer, and verifies an inline code only once", async () => {
    const d = deps({ role: "operator", session: "stale", db: fakeDb(importRpcs), userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }) });
    const res = await handle(req("POST", "/licences/cicc-imports", importBody({ code: "123456" })), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.userDb.calls).toEqual([{ fn: "platform_step_up_check", args: {} }]);
    expect(d.db.calls.find((c) => c.fn === "start_cicc_register_import")?.args).toMatchObject({ p_imported_by: ME });
    expect(d.sessionCalls).toEqual(["client:123456"]);
  });

  it("still dry-runs without a session or proof", async () => {
    const d = deps({ role: "operator", session: "none" });
    const res = await handle(req("POST", "/licences/cicc-imports", importBody({ dryRun: true })), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.userDb.calls).toEqual([]);
    expect(serviceWrites(d.db)).toEqual([]);
  });

  it("re-checks one credential only after the proof", async () => {
    const refused = deps({ role: "operator", session: "fresh", db: fakeDb({ platform_credential_detail: credential, check_licence_against_cicc_list: ID }), userDb: fakeDb({ platform_step_up_check: { error: { code: "42501", message: "step-up required" } } }) });
    expect((await handle(req("POST", `/licences/credentials/${ID}/cicc-check`, {}), ENDPOINTS, refused)).status).toBe(403);
    expect(serviceWrites(refused.db)).toEqual([]);
    const ok = deps({ role: "operator", session: "fresh", db: fakeDb({ platform_credential_detail: credential, check_licence_against_cicc_list: ID }), userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }) });
    expect((await handle(req("POST", `/licences/credentials/${ID}/cicc-check`, {}), ENDPOINTS, ok)).status).toBe(200);
    expect(serviceWrites(ok.db).map((c) => c.fn)).toEqual(["check_licence_against_cicc_list"]);
  });
});

// ------------------------------------------------------------------------------------------------ L1 lockout

describe("L1: authenticator code attempt lockout", () => {
  const stepUp = () => req("POST", "/session/step-up", { code: "123456" });

  it(`refuses a code after ${CODE_MAX_BAD_ATTEMPTS} recent bad attempts without trying it`, async () => {
    const d = deps({ session: "fresh", badAttempts: CODE_MAX_BAD_ATTEMPTS });
    const res = await handle(stepUp(), ENDPOINTS, d);
    expect(res.status).toBe(429);
    expect((await body(res)).error?.code).toBe("rate_limited");
    expect(d.sessionCalls).toEqual([]);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied" });
    expect(d.attemptQueries).toEqual([new Date((NOW - CODE_LOCKOUT_MINUTES * 60) * 1000).toISOString()]);
  });

  it("applies to sign-in and to codes sent with step-up actions too", async () => {
    const signIn = deps({ badAttempts: CODE_MAX_BAD_ATTEMPTS });
    expect((await handle(req("POST", "/session/sign-in", { password: "pw", code: "123456" }), ENDPOINTS, signIn)).status).toBe(429);
    expect(signIn.sessionCalls).toEqual([]);
    const retry = deps({ session: "stale", badAttempts: CODE_MAX_BAD_ATTEMPTS, db: fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }) });
    expect((await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered", code: "123456" }), ENDPOINTS, retry)).status).toBe(429);
    expect(retry.userDb.calls).toEqual([]);
  });

  it("allows the code below the limit and does not count requests without a code", async () => {
    const d = deps({ session: "fresh", badAttempts: CODE_MAX_BAD_ATTEMPTS - 1 });
    expect((await handle(stepUp(), ENDPOINTS, d)).status).toBe(200);
    expect(d.sessionCalls).toEqual(["stepUp"]);
    const noCode = deps({ session: "fresh", badAttempts: 99, db: fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }) });
    expect((await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered" }), ENDPOINTS, noCode)).status).toBe(200);
    expect(noCode.attemptQueries).toEqual([]);
  });

  it("fails closed when the attempts cannot be counted", async () => {
    const d = deps({ session: "fresh", badAttempts: new Error("count failed") });
    const res = await handle(stepUp(), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect(d.sessionCalls).toEqual([]);
  });

  it("marks a wrong code in the audit entry (what the lockout counts) without the code itself", async () => {
    const d = deps({
      session: "stale",
      badAttempts: 0,
      db: fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }),
      client: async () => {
        throw new SessionError("bad_code", "That authenticator code was not accepted.");
      },
    });
    const res = await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered", code: "654321" }), ENDPOINTS, d);
    expect(res.status).toBe(422);
    const entry = outcomeAudits(d.db)[0].args;
    expect(entry).toMatchObject({ p_result: "failure", p_context: { bad_attempt: "code", attempt_user_id: ME } });
    expect(JSON.stringify(auditCalls(d.db)) + JSON.stringify(d.logs)).not.toContain("654321");
  });
});

// ------------------------------------------------------------------------------------------------ L2 audit

describe("L2: high-risk actions fail closed on audit, gate refusals are logged", () => {
  it("does nothing when the high-risk audit entry cannot be written", async () => {
    const replay = deps({ session: "fresh", db: failingAudits(fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }), "all") });
    const res = await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered" }), ENDPOINTS, replay);
    expect(res.status).toBe(502);
    expect((await body(res)).error?.message).toMatch(/nothing was changed/);
    expect(replay.userDb.calls).toEqual([]);
    expect(replay.db.calls.map((c) => c.fn)).not.toContain("platform_outbox_event");

    const role = deps({ session: "fresh", db: failingAudits(fakeDb(), "all") });
    expect((await handle(req("PATCH", `/admins/${OTHER}/role`, { role: "operator" }), ENDPOINTS, role)).status).toBe(502);
    expect(role.userDb.calls).toEqual([]);

    const imp = deps({ role: "operator", session: "fresh", db: failingAudits(fakeDb(importRpcs), "all"), userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }) });
    expect((await handle(req("POST", "/licences/cicc-imports", importBody()), ENDPOINTS, imp)).status).toBe(502);
    expect(serviceWrites(imp.db)).toEqual([]);
  });

  it("retries the outcome entry once and raises an alert when it still fails", async () => {
    const d = deps({ session: "fresh", db: failingAudits(fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }), "outcome") });
    const res = await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered" }), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(auditCalls(d.db).map((c) => c.args.p_action)).toEqual(["admin_portal.health.replay.started", "admin_portal.health.replay", "admin_portal.health.replay"]);
    expect(d.logs.some((l) => l.extra?.alert === "audit_gap")).toBe(true);
  });

  it("logs gate refusals without returning internal detail", async () => {
    const denied = deps({ denied: new AdminDenied("email_not_allowed", "This identity is not on the admin allow list") });
    expect((await handle(req("GET", "/overview"), ENDPOINTS, denied)).status).toBe(403);
    expect(denied.logs).toContainEqual({ message: "admin api gate refused", extra: expect.objectContaining({ reason: "email_not_allowed", endpoint: "GET /overview" }) });

    const lookup = deps({ denied: new AdminDenied("lookup_failed", "platform_admins lookup failed: connection to 10.1.2.3 refused") });
    const res = await handle(req("GET", "/overview"), ENDPOINTS, lookup);
    const msg = (await body(res)).error?.message ?? "";
    expect(msg).not.toMatch(/10\.1\.2\.3|platform_admins/);
    expect(JSON.stringify(lookup.logs)).toMatch(/10\.1\.2\.3/);

    const config = deps({ denied: new AdminDenied("config", "SUPABASE_SECRET_KEY is missing") });
    expect((await body(await handle(req("GET", "/overview"), ENDPOINTS, config))).error?.message).not.toMatch(/SUPABASE/);
  });

  it("logs role, CSRF and step-up refusals", async () => {
    const viewer = deps({ role: "viewer" });
    await handle(req("GET", "/admins"), ENDPOINTS, viewer);
    expect(viewer.logs).toContainEqual({ message: "admin api request refused", extra: expect.objectContaining({ code: "forbidden", role: "viewer" }) });
    const csrf = deps({});
    await handle(req("POST", "/notices", { kind: "info" }, { origin: "https://elsewhere.example" }), ENDPOINTS, csrf);
    expect(csrf.logs).toContainEqual({ message: "admin api request refused", extra: expect.objectContaining({ code: "csrf_failed" }) });
  });
});

// ------------------------------------------------------------------------------------------------ L3 errors

describe("L3: database and auth messages stay on the server", () => {
  it("passes only our 22023 messages and maps the rest by code", () => {
    expect(fromDbError({ code: "22023", message: "only a dead-lettered event can be retried" }).message).toBe("only a dead-lettered event can be retried");
    for (const code of ["23514", "42501", "23505", "P0002", "PT409", "XX000", "42P01", ""]) {
      const e = fromDbError({ code, message: 'new row for relation "platform_admins" violates check constraint "secret_detail"' });
      expect(e.message, code).not.toMatch(/platform_admins|secret_detail/);
      expect(e.internal).toMatch(/secret_detail/);
    }
    expect(fromDbError({ code: "42501", message: "a recent step-up is required" }).code).toBe("step_up_required");
  });

  it("returns a generic message and logs the redacted detail", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl";
    const d = deps({ db: fakeDb({ platform_outbox_health: { error: { code: "XX000", message: `relation "outbox_internal" failed for ${jwt}` } } }) });
    const res = await handle(req("GET", "/health"), ENDPOINTS, d);
    expect(res.status).toBe(502);
    const text = JSON.stringify(await body(res));
    expect(text).not.toMatch(/outbox_internal/);
    const logs = JSON.stringify(d.logs);
    expect(logs).toMatch(/outbox_internal/);
    expect(logs).not.toContain(jwt);
  });

  it("does not return Auth or configuration detail from session errors", async () => {
    const d = deps({
      session: "fresh",
      db: fakeDb({ platform_outbox_event: { id: ID, organization_id: ORG, status: "dead_lettered" } }),
      client: async () => {
        throw new SessionError("unavailable", "The Worker has no SUPABASE_PUBLISHABLE_KEY; admin sign-in is unavailable.");
      },
    });
    const res = await handle(req("POST", `/health/dead-letters/${ID}/retry`, { reason: "Provider recovered" }), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect((await body(res)).error?.message).not.toMatch(/SUPABASE/);
  });

  it("redacts tokens and keys", () => {
    const out = redact("Bearer abc.def access_token=xyz sb_secret_123 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln password: hunter22");
    expect(out).not.toMatch(/abc\.def|xyz|sb_secret_123|eyJhbGci|hunter22/);
  });
});

// ------------------------------------------------------------------------------------------------ L5 templates/admins

describe("L5: template and reviewer-flag rules", () => {
  const inReview = { status: "draft", submitted_at: "2026-10-30T12:00:00Z", submitted_by: OTHER };
  const notSubmitted = { status: "draft", submitted_at: null, submitted_by: null };
  const reviewerDeps = (row: Record<string, unknown>) =>
    deps({ role: "operator", session: "fresh", templateReviewer: true, db: fakeDb({ platform_template_version: { version: { id: ID, status: "draft", author_user_id: OTHER }, sources: [], reviews: [] } }, { shared_template_versions: [row] }) });

  it("requires an explicit confirmation and a reason to roll back", async () => {
    for (const b of [{ reason: "Wrong fee amount" }, { reason: "Wrong fee amount", confirmRollback: false }, { confirmRollback: true }]) {
      const d = reviewerDeps(inReview);
      const res = await handle(req("POST", `/templates/versions/${ID}/rollback`, b), ENDPOINTS, d);
      expect(res.status).toBe(422);
      expect(d.userDb.calls).toEqual([]);
    }
    const ok = reviewerDeps(inReview);
    expect((await handle(req("POST", `/templates/versions/${ID}/rollback`, { reason: "Wrong fee amount", confirmRollback: true }), ENDPOINTS, ok)).status).toBe(200);
    expect(ok.userDb.calls[0]).toMatchObject({ fn: "rollback_shared_template_version", args: { p_version_id: ID, p_reason: "Wrong fee amount" } });
  });

  it("refuses to reject a draft the author has not submitted", async () => {
    const d = reviewerDeps(notSubmitted);
    const res = await handle(req("POST", `/templates/versions/${ID}/reject`, { reason: "Missing a step" }), ENDPOINTS, d);
    expect(res.status).toBe(409);
    expect(d.userDb.calls).toEqual([]);
    expect(d.sessionCalls).toEqual([]);
    const ok = reviewerDeps(inReview);
    expect((await handle(req("POST", `/templates/versions/${ID}/reject`, { reason: "Missing a step" }), ENDPOINTS, ok)).status).toBe(200);
  });

  const adminList = (role: string, reviewer = false) => fakeDb({ platform_admin_list: { admins: [{ user_id: OTHER, email: "ops@mail.grokbot.com", role, template_reviewer: reviewer }] } });

  it("never grants the reviewer flag to a viewer", async () => {
    const d = deps({ session: "fresh", db: adminList("viewer") });
    const res = await handle(req("PATCH", `/admins/${OTHER}/reviewer`, { templateReviewer: true }), ENDPOINTS, d);
    expect(res.status).toBe(409);
    expect(d.userDb.calls).toEqual([]);
    const off = deps({ session: "fresh", db: adminList("viewer", true) });
    expect((await handle(req("PATCH", `/admins/${OTHER}/reviewer`, { templateReviewer: false }), ENDPOINTS, off)).status).toBe(200);
    expect(off.userDb.calls[0]).toMatchObject({ fn: "platform_admin_set_reviewer", args: { p_template_reviewer: false } });
    const operator = deps({ session: "fresh", db: adminList("operator") });
    expect((await handle(req("PATCH", `/admins/${OTHER}/reviewer`, { templateReviewer: true }), ENDPOINTS, operator)).status).toBe(200);
  });

  it("refuses a viewer invite with the reviewer flag, and demoting a reviewer to viewer", async () => {
    const invite = deps({ session: "fresh", userDb: fakeDb({ platform_admin_invite: ID }) });
    const res = await handle(req("POST", "/admins/invites", { email: "new@mail.grokbot.com", role: "viewer", templateReviewer: true }), ENDPOINTS, invite);
    expect(res.status).toBe(422);
    expect(invite.userDb.calls).toEqual([]);
    const demote = deps({ session: "fresh", db: adminList("operator", true) });
    expect((await handle(req("PATCH", `/admins/${OTHER}/role`, { role: "viewer" }), ENDPOINTS, demote)).status).toBe(409);
    expect(demote.userDb.calls).toEqual([]);
    const plain = deps({ session: "fresh", db: adminList("operator", false) });
    expect((await handle(req("PATCH", `/admins/${OTHER}/role`, { role: "viewer" }), ENDPOINTS, plain)).status).toBe(200);
  });
});

// ------------------------------------------------------------------------------------------------ L6 session lifetime

describe("L6: absolute session lifetime", () => {
  it("ends a session without an absolute end, past it, or with an end the portal could not have set", () => {
    expect(absoluteExpired(null, null, NOW)).toBe(true);
    expect(absoluteExpired(NOW, null, NOW)).toBe(true);
    expect(absoluteExpired(NOW + SESSION_ABSOLUTE_MAX_SECONDS * 10, null, NOW)).toBe(true);
    expect(absoluteExpired(NOW + 60, null, NOW)).toBe(false);
  });

  it("also ends it 12 hours after the verified token's password sign-in, whatever the cookie says", () => {
    const old = token({ sub: ME, amr: [{ method: "password", timestamp: NOW - SESSION_ABSOLUTE_MAX_SECONDS - 1 }, { method: "totp", timestamp: NOW - 30 }] });
    const recent = token({ sub: ME, amr: [{ method: "password", timestamp: NOW - 3600 }, { method: "totp", timestamp: NOW - 30 }] });
    expect(passwordSignInAt(old)).toBe(NOW - SESSION_ABSOLUTE_MAX_SECONDS - 1);
    expect(absoluteExpired(NOW + 600, old, NOW)).toBe(true);
    expect(absoluteExpired(NOW + 600, recent, NOW)).toBe(false);
    expect(passwordSignInAt(token({ sub: ME, amr: [{ method: "totp", timestamp: NOW }] }))).toBeNull();
  });
});
