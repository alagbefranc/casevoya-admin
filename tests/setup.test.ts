import { describe, expect, it } from "vitest";
import { handle, type ApiDeps } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { SETUP_ALREADY_DONE_MESSAGE, SETUP_MAX_BAD_ATTEMPTS, SETUP_NOTE, type SetupApi, type SetupFactor, type SetupUser } from "@/lib/api/modules/setup";
import { AdminDenied, evaluateSetupGate, type SetupContext } from "@/lib/guard";
import { SessionError, type SessionStatus } from "@/lib/session";
import { ID, ME, NOW, auditCalls, deps as baseDeps, env, fakeDb, req, sessionState, type FakeDb } from "./api-helpers";

/** First-admin Setup: the server-side gate and every /setup endpoint, against mocks only. */

const GOOD = "correct horse battery";
const verified: SetupFactor = { id: "f-verified", type: "totp", status: "verified", createdAt: "2026-10-01T00:00:00Z" };
const pending: SetupFactor = { id: "f-pending", type: "totp", status: "unverified", createdAt: "2026-10-30T00:00:00Z" };
const aal1: SessionStatus = { ...sessionState("fresh"), aal: "aal1", stepUpAt: null, stepUpFreshUntil: null };

type World = {
  user: SetupUser | null;
  session: SessionStatus | null;
  badAttempts: number;
  calls: string[];
  password: string;
};

function world(over: Partial<World> = {}): World {
  return { user: null, session: null, badAttempts: 0, calls: [], password: GOOD, ...over };
}

function fakeSetup(w: World): SetupApi {
  return {
    async acceptInvite() {
      w.calls.push("acceptInvite");
      return { ok: true, result: { user_id: ME, role: "operator", template_reviewer: false } };
    },
    async getUser(_c, userId) {
      w.calls.push(`getUser:${userId}`);
      return w.user && w.user.id === userId ? w.user : null;
    },
    async createUser(_c, input) {
      w.calls.push(`createUser:${input.fullName}`);
      w.user = { id: ME, emailConfirmed: true, fullName: input.fullName, factors: [] };
      w.password = input.password;
      return w.user;
    },
    async updateUser(_c, userId, patch) {
      w.calls.push(`updateUser:${userId}:${Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined).sort().join(",")}`);
      if (w.user && patch.fullName) w.user.fullName = patch.fullName;
      if (patch.password) w.password = patch.password;
    },
    async signIn(_t, password) {
      w.calls.push("signIn");
      if (password !== w.password) {
        throw new SessionError("bad_credentials", "Wrong email or password");
      }
      w.session = aal1;
      return aal1;
    },
    async session() {
      return w.session;
    },
    async enrol() {
      w.calls.push("enrol");
      const factor = { id: "f-new", type: "totp", status: "unverified", createdAt: "2026-10-30T01:00:00Z" };
      if (w.user) w.user.factors = [...w.user.factors, factor];
      return { factorId: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "FAKESECRETFORTESTS", uri: "otpauth://totp/x" };
    },
    async deleteFactor(_c, _u, factorId) {
      w.calls.push(`deleteFactor:${factorId}`);
      if (w.user) w.user.factors = w.user.factors.filter((f) => f.id !== factorId);
    },
    async deleteAllFactors(_c, userId) {
      const removed = w.user?.factors.length ?? 0;
      w.calls.push(`deleteAllFactors:${userId}:${removed}`);
      if (w.user) w.user.factors = [];
      return removed;
    },
    async verify(_t, factorId, code) {
      w.calls.push(`verify:${factorId}`);
      if (code !== "123456") throw new SessionError("bad_code", "That code is not valid");
      if (w.user) w.user.factors = w.user.factors.map((f) => (f.id === factorId ? { ...f, status: "verified" } : f));
      w.session = sessionState("fresh");
      return w.session;
    },
    async recentBadAttempts() {
      return w.badAttempts;
    },
  };
}

function setupCaller(db: FakeDb, userId: string | null): SetupContext {
  return { email: "admin@casevoya.ca", subject: "s", expiresAt: 0, userId, env, db: db as never, role: null, templateReviewer: false, setup: true };
}

function deps(w: World, opts: { locked?: boolean; denied?: AdminDenied; rpcs?: Record<string, unknown> } = {}) {
  const db = fakeDb({ bootstrap_first_platform_admin: ME, ...(opts.rpcs ?? {}) });
  const base = baseDeps({ db });
  const logs: { message: string; extra?: Record<string, unknown> }[] = [];
  const d: ApiDeps & { db: FakeDb; logs: typeof logs } = {
    ...base,
    db,
    logs,
    log: (message, extra) => logs.push({ message, extra }),
    setup: fakeSetup(w),
    gate: async (mode) => {
      if (opts.denied) throw opts.denied;
      if (mode !== "setup") throw new AdminDenied("not_platform_admin", "no");
      if (opts.locked) throw new AdminDenied("setup_locked", "Setup is locked", { locked: true, lockedAt: "2026-10-30T12:00:00Z" });
      return setupCaller(db, w.user?.id ?? null);
    },
  };
  return d;
}

async function call(d: ApiDeps, method: string, path: string, body?: unknown) {
  const res = await handle(req(method, path, body), ENDPOINTS, d);
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } } };
}

describe("evaluateSetupGate", () => {
  const okVerify = async () => ({ email: "admin@casevoya.ca", subject: "s", expiresAt: 0 });
  const fakeClient = () => ({}) as never;

  it("opens while platform_admins is empty, even before the auth user exists", async () => {
    const ctx = await evaluateSetupGate({ token: "t", env, verify: okVerify, lookupUser: async () => null, makeClient: fakeClient, countAdmins: async () => ({ count: 0, firstAt: null }) });
    expect(ctx).toMatchObject({ setup: true, userId: null, role: null, email: "admin@casevoya.ca" });
  });
  it("passes the existing user id through", async () => {
    const ctx = await evaluateSetupGate({ token: "t", env, verify: okVerify, lookupUser: async () => ME, makeClient: fakeClient, countAdmins: async () => ({ count: 0, firstAt: null }) });
    expect(ctx.userId).toBe(ME);
  });
  it("locks for good once any admin exists", async () => {
    const err = await evaluateSetupGate({ token: "t", env, verify: okVerify, lookupUser: async () => ME, makeClient: fakeClient, countAdmins: async () => ({ count: 1, firstAt: "2026-10-30T12:00:00Z" }) }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminDenied);
    expect(err).toMatchObject({ reason: "setup_locked", details: { locked: true, lockedAt: "2026-10-30T12:00:00Z" } });
  });
  it("refuses without a valid Access JWT before touching the database", async () => {
    let counted = false;
    const err = await evaluateSetupGate({ token: null, env, makeClient: fakeClient, countAdmins: async () => { counted = true; return { count: 0, firstAt: null }; } }).catch((e) => e);
    expect(err).toMatchObject({ reason: "no_access_jwt" });
    expect(counted).toBe(false);
  });
  it("refuses an email that is not on the allow list", async () => {
    const err = await evaluateSetupGate({ token: "t", env: { ...env, allowedEmails: ["someone@casevoya.ca"] }, makeClient: fakeClient, countAdmins: async () => ({ count: 0, firstAt: null }) }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminDenied);
    expect(["bad_access_jwt", "email_not_allowed"]).toContain(err.reason);
  });
  it("fails closed when the count cannot be read", async () => {
    const err = await evaluateSetupGate({ token: "t", env, verify: okVerify, makeClient: fakeClient, countAdmins: async () => { throw new Error("db down"); } }).catch((e) => e);
    expect(err).toMatchObject({ reason: "lookup_failed" });
  });
});

describe("setup endpoints: the gate", () => {
  const paths: [string, string, unknown][] = [
    ["GET", "/setup", undefined],
    ["POST", "/setup/account", { fullName: "Francis A", password: GOOD }],
    ["POST", "/setup/password", { fullName: "Francis A", password: GOOD, confirm: true }],
    ["POST", "/setup/authenticator", {}],
    ["POST", "/setup/authenticator/verify", { code: "123456" }],
    ["POST", "/setup/finish", { confirm: true }],
  ];
  it.each(paths)("%s %s answers 409 once locked and does nothing", async (method, path, body) => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [verified] }, session: sessionState("fresh") });
    const d = deps(w, { locked: true });
    const { status, json } = await call(d, method, path, body);
    expect(status).toBe(409);
    expect(json.error?.code).toBe("conflict");
    expect(json.error?.details).toMatchObject({ locked: true, lockedAt: "2026-10-30T12:00:00Z" });
    expect(w.calls).toEqual([]);
    expect(d.db.calls).toEqual([]);
  });
  it.each(paths)("%s %s refuses without an Access JWT", async (method, path, body) => {
    const w = world();
    const d = deps(w, { denied: new AdminDenied("no_access_jwt", "no Access session") });
    const { status } = await call(d, method, path, body);
    expect(status).toBe(401);
    expect(w.calls).toEqual([]);
  });
  it("refuses an admin caller on setup endpoints (setup gate only)", async () => {
    const d = { ...baseDeps({ role: "owner" }), setup: fakeSetup(world()) };
    const { status } = await call(d, "GET", "/setup");
    expect(status).toBe(403);
  });
  it("refuses cross-origin setup mutations", async () => {
    const w = world();
    const d = deps(w);
    const res = await handle(req("POST", "/setup/account", { fullName: "Francis A", password: GOOD }, { origin: "https://evil.example" }), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect(w.calls).toEqual([]);
  });
  it("every setup mutation has an audit action and the setup gate", () => {
    const setup = ENDPOINTS.filter((e) => e.path.startsWith("/setup"));
    expect(setup).toHaveLength(6);
    for (const e of setup) {
      expect(e.gate).toBe("setup");
      if (e.method !== "GET") expect(e.audit?.action).toMatch(/^setup\./);
    }
  });
});

describe("GET /setup", () => {
  it("starts at the account step when no user exists", async () => {
    const { status, json } = await call(deps(world()), "GET", "/setup");
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ state: "open", email: "admin@casevoya.ca", step: "account", account: { exists: false }, passwordMinLength: 12 });
  });
  it("asks an existing but signed-out user for their password", async () => {
    const { json } = await call(deps(world({ user: { id: ME, emailConfirmed: true, fullName: "Francis", factors: [] } })), "GET", "/setup");
    expect(json.data).toMatchObject({ step: "account", account: { exists: true, fullName: "Francis" } });
  });
  it("moves to the authenticator once signed in, and reports a pending factor", async () => {
    const { json } = await call(deps(world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [pending] }, session: aal1 })), "GET", "/setup");
    expect(json.data).toMatchObject({ step: "authenticator", authenticator: { verified: false, pending: true } });
  });
  it("ignores a session that belongs to another user", async () => {
    const { json } = await call(deps(world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [verified] }, session: sessionState("other") })), "GET", "/setup");
    expect(json.data).toMatchObject({ step: "account" });
  });
  it("reaches finish with a verified factor and an aal2 session", async () => {
    const { json } = await call(deps(world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [verified] }, session: sessionState("fresh") })), "GET", "/setup");
    expect(json.data).toMatchObject({ step: "finish", authenticator: { verified: true } });
  });
});

describe("POST /setup/account", () => {
  it("creates a confirmed user when none exists, signs in and audits", async () => {
    const w = world();
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/account", { fullName: "  Francis Alagbe ", password: GOOD });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ step: "authenticator", created: true, userId: ME });
    expect(w.calls).toEqual(["createUser:Francis Alagbe", "signIn"]);
    const audit = auditCalls(d.db);
    expect(audit).toHaveLength(1);
    expect(audit[0].args).toMatchObject({ p_action: "admin_portal.setup.account", p_result: "success", p_actor: ME, p_object_id: ME });
    expect(JSON.stringify(audit[0].args)).not.toContain(GOOD);
  });
  it("signs an existing user in with the right password and saves the name", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] } });
    const { status, json } = await call(deps(w), "POST", "/setup/account", { fullName: "Francis Alagbe", password: GOOD });
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ created: false });
    expect(w.calls).toEqual([`getUser:${ME}`, "signIn", `updateUser:${ME}:fullName`]);
  });
  it("refuses an existing unconfirmed account without confirming it or checking its password", async () => {
    for (const pw of [GOOD, "wrong password!!"]) {
      const w = world({ user: { id: ME, emailConfirmed: false, fullName: null, factors: [verified] } });
      const d = deps(w);
      const { status, json } = await call(d, "POST", "/setup/account", { fullName: "Francis Alagbe", password: pw });
      expect(status).toBe(422);
      expect(json.error?.code).toBe("validation_failed");
      expect(json.error?.details).toMatchObject({ canReset: true, unconfirmed: true, issues: [{ path: "password" }] });
      expect(w.calls).toEqual([`getUser:${ME}`]);
      expect(w.calls.some((c) => c.startsWith("updateUser"))).toBe(false);
      expect(w.session).toBeNull();
      const audit = auditCalls(d.db)[0].args as { p_context?: Record<string, unknown> };
      expect(audit.p_context?.setup_bad_attempt).toBeUndefined();
    }
  });
  it("refuses a wrong password, offers the reset path and records a bad attempt without the password", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] } });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/account", { fullName: "Francis Alagbe", password: "wrong password!!" });
    expect(status).toBe(422);
    expect(json.error?.code).toBe("validation_failed");
    expect(json.error?.details).toMatchObject({ canReset: true, issues: [{ path: "password" }] });
    expect(w.calls).not.toContain(`updateUser:${ME}:fullName`);
    const audit = auditCalls(d.db)[0].args;
    expect(audit).toMatchObject({ p_result: "failure", p_context: { setup_email: "admin@casevoya.ca", setup_bad_attempt: "password" } });
    expect(JSON.stringify(audit) + JSON.stringify(d.logs)).not.toContain("wrong password!!");
  });
  it("needs at least 12 characters", async () => {
    const w = world();
    const { status, json } = await call(deps(w), "POST", "/setup/account", { fullName: "Francis", password: "elevenchars" });
    expect(status).toBe(422);
    expect(json.error?.message).toMatch(/12/);
    expect(w.calls).toEqual([]);
    const ok = await call(deps(world()), "POST", "/setup/account", { fullName: "Francis", password: "twelve chars" });
    expect(ok.status).toBe(200);
  });
  it("locks out after too many bad attempts", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] }, badAttempts: SETUP_MAX_BAD_ATTEMPTS });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/account", { fullName: "Francis", password: GOOD });
    expect(status).toBe(429);
    expect(json.error?.code).toBe("rate_limited");
    expect(w.calls).not.toContain("signIn");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "denied" });
  });
});

describe("POST /setup/password", () => {
  it("sets a new password on the existing user, then signs in", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] } });
    const d = deps(w);
    const { status } = await call(d, "POST", "/setup/password", { fullName: "Francis", password: "a brand new password", confirm: true });
    expect(status).toBe(200);
    expect(w.calls).toEqual([`getUser:${ME}`, `updateUser:${ME}:fullName,password`, "signIn"]);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.setup.password_reset", p_result: "success" });
  });
  it("keeps the factors of a confirmed account", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [verified, pending] } });
    const { status } = await call(deps(w), "POST", "/setup/password", { fullName: "Francis", password: "a brand new password", confirm: true });
    expect(status).toBe(200);
    expect(w.calls.some((c) => c.startsWith("delete"))).toBe(false);
    expect(w.user?.factors).toEqual([verified, pending]);
  });
  it("on an unconfirmed account removes all factors, then confirms the email and sets the password", async () => {
    const w = world({ user: { id: ME, emailConfirmed: false, fullName: null, factors: [verified, pending] } });
    const d = deps(w);
    const { status } = await call(d, "POST", "/setup/password", { fullName: "Francis", password: "a brand new password", confirm: true });
    expect(status).toBe(200);
    expect(w.calls).toEqual([`getUser:${ME}`, `deleteAllFactors:${ME}:2`, `updateUser:${ME}:confirmEmail,fullName,password`, "signIn"]);
    expect(w.user?.factors).toEqual([]);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "success", p_context: { was_unconfirmed: true, removed_factors: 2 } });
  });
  it("needs explicit confirmation", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] } });
    const { status } = await call(deps(w), "POST", "/setup/password", { fullName: "Francis", password: "a brand new password" });
    expect(status).toBe(422);
    expect(w.calls).toEqual([]);
  });
  it("refuses when there is no account to reset", async () => {
    const { status } = await call(deps(world()), "POST", "/setup/password", { fullName: "Francis", password: "a brand new password", confirm: true });
    expect(status).toBe(409);
  });
});

describe("POST /setup/authenticator", () => {
  const user = (factors: SetupFactor[]): SetupUser => ({ id: ME, emailConfirmed: true, fullName: null, factors });
  it("needs a signed-in session first", async () => {
    const w = world({ user: user([]) });
    const { status, json } = await call(deps(w), "POST", "/setup/authenticator", {});
    expect(status).toBe(401);
    expect(json.error?.code).toBe("session_required");
    expect(w.calls).not.toContain("enrol");
  });
  it("enrols a new TOTP factor and returns the QR and key only in the response", async () => {
    const w = world({ user: user([]), session: aal1 });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/authenticator", {});
    expect(status).toBe(200);
    expect(json.data).toMatchObject({ mode: "new", factorId: "f-new", secret: "FAKESECRETFORTESTS" });
    expect(JSON.stringify(d.logs) + JSON.stringify(d.db.calls)).not.toContain("FAKESECRETFORTESTS");
  });
  it("keeps a pending factor on reload instead of replacing a scanned QR", async () => {
    const w = world({ user: user([pending]), session: aal1 });
    const { json } = await call(deps(w), "POST", "/setup/authenticator", {});
    expect(json.data).toEqual({ mode: "pending" });
    expect(w.calls).not.toContain("enrol");
    expect(w.calls.some((c) => c.startsWith("deleteFactor"))).toBe(false);
  });
  it("on restart removes only unverified factors, then enrols", async () => {
    const w = world({ user: user([pending]), session: aal1 });
    const { json } = await call(deps(w), "POST", "/setup/authenticator", { restart: true });
    expect(json.data).toMatchObject({ mode: "new" });
    expect(w.calls).toContain("deleteFactor:f-pending");
    expect(w.calls.indexOf("deleteFactor:f-pending")).toBeLessThan(w.calls.indexOf("enrol"));
  });
  it("uses an already verified factor instead of enrolling", async () => {
    const w = world({ user: user([verified]), session: aal1 });
    const { json } = await call(deps(w), "POST", "/setup/authenticator", { restart: true });
    expect(json.data).toEqual({ mode: "existing" });
    expect(w.calls).not.toContain("enrol");
    expect(w.calls.some((c) => c.startsWith("deleteFactor"))).toBe(false);
  });
});

describe("POST /setup/authenticator/verify", () => {
  const user = (factors: SetupFactor[]): SetupUser => ({ id: ME, emailConfirmed: true, fullName: null, factors });
  it("verifies the pending factor", async () => {
    const w = world({ user: user([pending]), session: aal1 });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/authenticator/verify", { code: "123456" });
    expect(status).toBe(200);
    expect(json.data).toEqual({ step: "finish" });
    expect(w.calls).toContain("verify:f-pending");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.setup.authenticator_verified", p_result: "success" });
  });
  it("prefers a verified factor", async () => {
    const w = world({ user: user([pending, verified]), session: aal1 });
    await call(deps(w), "POST", "/setup/authenticator/verify", { code: "123456" });
    expect(w.calls).toContain("verify:f-verified");
  });
  it("refuses a wrong code and records a bad attempt", async () => {
    const w = world({ user: user([pending]), session: aal1 });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/authenticator/verify", { code: "000000" });
    expect(status).toBe(422);
    expect(json.error?.details).toMatchObject({ issues: [{ path: "code" }] });
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "failure", p_context: { setup_bad_attempt: "code" } });
    expect(JSON.stringify(auditCalls(d.db))).not.toContain("000000");
  });
  it("needs a factor to verify", async () => {
    const w = world({ user: user([]), session: aal1 });
    const { status } = await call(deps(w), "POST", "/setup/authenticator/verify", { code: "123456" });
    expect(status).toBe(409);
  });
  it("locks out after too many bad codes", async () => {
    const w = world({ user: user([pending]), session: aal1, badAttempts: SETUP_MAX_BAD_ATTEMPTS + 2 });
    const { status } = await call(deps(w), "POST", "/setup/authenticator/verify", { code: "123456" });
    expect(status).toBe(429);
    expect(w.calls.some((c) => c.startsWith("verify"))).toBe(false);
  });
  it("rejects a malformed code before any lookup", async () => {
    const w = world({ user: user([pending]), session: aal1 });
    const { status } = await call(deps(w), "POST", "/setup/authenticator/verify", { code: "12ab" });
    expect(status).toBe(422);
    expect(w.calls).toEqual([]);
  });
});

describe("POST /setup/finish", () => {
  const user = (factors: SetupFactor[]): SetupUser => ({ id: ME, emailConfirmed: true, fullName: "Francis", factors });
  it("calls bootstrap_first_platform_admin on the service client with the fixed note", async () => {
    const w = world({ user: user([verified]), session: sessionState("fresh") });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/finish", { confirm: true });
    expect(status).toBe(200);
    expect(json.data).toEqual({ done: true, userId: ME, role: "owner" });
    const boot = d.db.calls.filter((c) => c.fn === "bootstrap_first_platform_admin");
    expect(boot).toEqual([{ fn: "bootstrap_first_platform_admin", args: { p_user_id: ME, p_note: SETUP_NOTE } }]);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.setup.finished", p_result: "success", p_actor: ME });
  });
  it("refuses with an unverified factor", async () => {
    const w = world({ user: user([pending]), session: sessionState("fresh") });
    const d = deps(w);
    const { status } = await call(d, "POST", "/setup/finish", { confirm: true });
    expect(status).toBe(409);
    expect(d.db.calls.some((c) => c.fn === "bootstrap_first_platform_admin")).toBe(false);
  });
  it("refuses an aal1 session", async () => {
    const w = world({ user: user([verified]), session: aal1 });
    const d = deps(w);
    const { status, json } = await call(d, "POST", "/setup/finish", { confirm: true });
    expect(status).toBe(403);
    expect(json.error?.code).toBe("step_up_required");
    expect(d.db.calls.some((c) => c.fn === "bootstrap_first_platform_admin")).toBe(false);
  });
  it("refuses without a session", async () => {
    const w = world({ user: user([verified]) });
    const d = deps(w);
    const { status } = await call(d, "POST", "/setup/finish", { confirm: true });
    expect(status).toBe(401);
    expect(d.db.calls.some((c) => c.fn === "bootstrap_first_platform_admin")).toBe(false);
  });
  it("maps the database's 'already exists' refusal (42501 or 55000) to the friendly locked message (race with another bootstrap)", async () => {
    for (const code of ["42501", "55000"]) {
      const w = world({ user: user([verified]), session: sessionState("fresh") });
      const d = deps(w, { rpcs: { bootstrap_first_platform_admin: { error: { code, message: "a platform admin already exists; use an invite instead" } } } });
      const { status, json } = await call(d, "POST", "/setup/finish", { confirm: true });
      expect(status, code).toBe(409);
      expect(json.error?.code).toBe("conflict");
      expect(json.error?.message).toBe(SETUP_ALREADY_DONE_MESSAGE);
      expect(json.error?.details).toMatchObject({ locked: true });
    }
  });
  it("keeps other bootstrap failures generic", async () => {
    const w = world({ user: user([verified]), session: sessionState("fresh") });
    const d = deps(w, { rpcs: { bootstrap_first_platform_admin: { error: { code: "XX000", message: 'relation "platform_admins" is broken' } } } });
    const { status, json } = await call(d, "POST", "/setup/finish", { confirm: true });
    expect(status).toBe(502);
    expect(json.error?.message).not.toMatch(/platform_admins/);
  });
  it("needs explicit confirmation", async () => {
    const w = world({ user: user([verified]), session: sessionState("fresh") });
    const d = deps(w);
    const { status } = await call(d, "POST", "/setup/finish", {});
    expect(status).toBe(422);
    expect(d.db.calls.some((c) => c.fn === "bootstrap_first_platform_admin")).toBe(false);
  });
});

describe("the lockout window", () => {
  it("passes a since-time 15 minutes before now", async () => {
    let since = "";
    const w = world();
    const d = deps(w);
    d.setup = { ...fakeSetup(w), recentBadAttempts: async (_c, s) => { since = s; return 0; } };
    await call(d, "POST", "/setup/account", { fullName: "Francis", password: GOOD });
    expect(since).toBe(new Date((NOW - 15 * 60) * 1000).toISOString());
  });
  void ID;
});
