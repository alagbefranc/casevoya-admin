import { describe, expect, it } from "vitest";
import { handle, type ApiDeps } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import type { SetupApi, SetupUser } from "@/lib/api/modules/setup";
import { AdminDenied, evaluateJoinGate, type JoinContext } from "@/lib/guard";
import { SessionError, type SessionStatus } from "@/lib/session";
import { ID, ME, deps as baseDeps, env, fakeDb, req, sessionState, type FakeDb } from "./api-helpers";

/** Invited admins joining: the join gate and every /join endpoint, against mocks only. */

const GOOD = "correct horse battery";
const NEW = "worker@mail.grokbot.com";
const aal1: SessionStatus = { ...sessionState("fresh"), aal: "aal1", stepUpAt: null, stepUpFreshUntil: null };
const invite = { id: ID, role: "operator" as const, templateReviewer: false, expiresAt: "2026-11-06T00:00:00Z" };

type World = { user: SetupUser | null; session: SessionStatus | null; calls: string[]; password: string; acceptError?: { code: string; message: string } };
const world = (over: Partial<World> = {}): World => ({ user: null, session: null, calls: [], password: GOOD, ...over });

function fakeSetup(w: World): SetupApi {
  return {
    async getUser(_c, userId) {
      return w.user && w.user.id === userId ? w.user : null;
    },
    async createUser(c, input) {
      w.calls.push(`createUser:${c.email}`);
      w.user = { id: ME, emailConfirmed: true, fullName: input.fullName, factors: [] };
      w.password = input.password;
      return w.user;
    },
    async updateUser(_c, userId, patch) {
      w.calls.push(`updateUser:${userId}:${Object.keys(patch).sort().join(",")}`);
    },
    async signIn(_t, password) {
      w.calls.push("signIn");
      if (password !== w.password) throw new SessionError("bad_credentials", "no");
      w.session = aal1;
      return aal1;
    },
    async session() {
      return w.session;
    },
    async enrol() {
      w.calls.push("enrol");
      if (w.user) w.user.factors = [{ id: "f-new", type: "totp", status: "unverified", createdAt: "2026-10-30T01:00:00Z" }];
      return { factorId: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "FAKESECRETFORTESTS", uri: "otpauth://totp/x" };
    },
    async deleteFactor() {},
    async deleteAllFactors() {
      w.calls.push("deleteAllFactors");
      return 0;
    },
    async verify(_t, factorId, code) {
      w.calls.push(`verify:${factorId}`);
      if (code !== "123456") throw new SessionError("bad_code", "no");
      if (w.user) w.user.factors = w.user.factors.map((f) => ({ ...f, status: "verified" }));
      w.session = sessionState("fresh");
      return w.session;
    },
    async recentBadAttempts() {
      return 0;
    },
    async acceptInvite() {
      w.calls.push("acceptInvite");
      if (w.acceptError) return { ok: false, error: w.acceptError };
      return { ok: true, result: { user_id: ME, role: "operator", template_reviewer: false } };
    },
  };
}

function joinCaller(db: FakeDb, userId: string | null): JoinContext {
  return { email: NEW, subject: "s", expiresAt: 0, userId, env, db: db as never, role: null, templateReviewer: false, setup: true, join: invite };
}

function deps(w: World, opts: { denied?: AdminDenied } = {}) {
  const db = fakeDb();
  const d: ApiDeps & { db: FakeDb } = {
    ...baseDeps({ db }),
    db,
    setup: fakeSetup(w),
    gate: async (mode) => {
      if (opts.denied) throw opts.denied;
      if (mode !== "join") throw new AdminDenied("not_platform_admin", "no");
      return joinCaller(db, w.user?.id ?? null);
    },
  };
  return d;
}

async function call(d: ApiDeps, method: string, path: string, body?: unknown) {
  const res = await handle(req(method, path, body), ENDPOINTS, d);
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string } } };
}

describe("evaluateJoinGate", () => {
  const okVerify = async () => ({ email: NEW, subject: "s", expiresAt: 0 });
  const fakeClient = () => ({}) as never;
  it("opens for an open invite even before the auth user exists", async () => {
    const ctx = await evaluateJoinGate({ token: "t", env, verify: okVerify, lookupUser: async () => null, makeClient: fakeClient, invite: async () => invite });
    expect(ctx).toMatchObject({ setup: true, userId: null, join: invite, email: NEW });
  });
  it("refuses without an open invite", async () => {
    const err = await evaluateJoinGate({ token: "t", env, verify: okVerify, lookupUser: async () => null, makeClient: fakeClient, invite: async () => null }).catch((e) => e);
    expect(err).toMatchObject({ reason: "not_platform_admin" });
  });
  it("refuses someone who is already an admin", async () => {
    const err = await evaluateJoinGate({ token: "t", env, verify: okVerify, lookupUser: async () => ME, makeClient: fakeClient, invite: async () => invite, adminRecord: async () => ({ role: "viewer", templateReviewer: false }) }).catch((e) => e);
    expect(err).toMatchObject({ reason: "setup_locked", details: { alreadyAdmin: true } });
  });
  it("admits an invited email that is not on ADMIN_ALLOWED_EMAILS through the dynamic allow list", async () => {
    const seen: string[] = [];
    const verify: typeof okVerify = async () => ({ email: NEW, subject: "s", expiresAt: 0 });
    const ctx = await evaluateJoinGate({
      token: "t",
      env,
      verify: (async (_t: string | null, o: { isAllowed?: (e: string) => Promise<boolean> }) => {
        seen.push(String(await o.isAllowed?.(NEW)));
        return verify();
      }) as never,
      dynamicAllowed: async () => true,
      lookupUser: async () => null,
      makeClient: fakeClient,
      invite: async () => invite,
    });
    expect(seen).toEqual(["true"]);
    expect(ctx.email).toBe(NEW);
  });
});

describe("join endpoints", () => {
  it("are all on the join gate, and mutations are audited as join.*", () => {
    const join = ENDPOINTS.filter((e) => e.path.startsWith("/join"));
    expect(join.map((e) => `${e.method} ${e.path}`)).toEqual(["GET /join", "POST /join/account", "POST /join/authenticator", "POST /join/authenticator/verify", "POST /join/finish"]);
    for (const e of join) {
      expect(e.gate).toBe("join");
      if (e.method !== "GET") expect(e.audit?.action).toMatch(/^join\./);
    }
    expect(ENDPOINTS.some((e) => e.path === "/join/password")).toBe(false);
  });
  it("refuses admins and setup callers", async () => {
    const d = { ...baseDeps({ role: "owner" }), setup: fakeSetup(world()) };
    expect((await call(d, "GET", "/join")).status).toBe(403);
  });
  it("refuses without an Access JWT", async () => {
    const w = world();
    expect((await call(deps(w, { denied: new AdminDenied("no_access_jwt", "no") }), "GET", "/join")).status).toBe(401);
  });
  it("walks a brand-new worker from no account to an accepted invite", async () => {
    const w = world();
    const d = deps(w);
    let s = await call(d, "GET", "/join");
    expect(s.json.data).toMatchObject({ step: "account", email: NEW, invite: { role: "operator" }, account: { exists: false } });
    expect((await call(d, "POST", "/join/account", { fullName: "New Worker", password: GOOD })).status).toBe(200);
    expect(w.calls).toEqual([`createUser:${NEW}`, "signIn"]);
    s = await call(d, "POST", "/join/authenticator", {});
    expect(s.json.data).toMatchObject({ mode: "new", factorId: "f-new" });
    expect((await call(d, "POST", "/join/finish", { confirm: true })).status).toBe(409);
    expect((await call(d, "POST", "/join/authenticator/verify", { code: "123456" })).json.data).toMatchObject({ step: "finish" });
    s = await call(d, "POST", "/join/finish", { confirm: true });
    expect(s.status).toBe(200);
    expect(s.json.data).toMatchObject({ done: true, role: "operator" });
    expect(w.calls.at(-1)).toBe("acceptInvite");
  });
  it("signs an existing confirmed account in instead of creating one", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [] } });
    const { status } = await call(deps(w), "POST", "/join/account", { fullName: "Old Hand", password: GOOD });
    expect(status).toBe(200);
    expect(w.calls).toEqual(["signIn", `updateUser:${ME}:fullName`]);
  });
  it("never takes over an unconfirmed account", async () => {
    const w = world({ user: { id: ME, emailConfirmed: false, fullName: null, factors: [] } });
    const { status, json } = await call(deps(w), "POST", "/join/account", { fullName: "X Y", password: GOOD });
    expect(status).toBe(409);
    expect(json.error?.message).toMatch(/never confirmed/);
    expect(w.calls).toEqual([]);
  });
  it("refuses finish without aal2", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [{ id: "f", type: "totp", status: "verified", createdAt: "" }] }, session: aal1 });
    const { status } = await call(deps(w), "POST", "/join/finish", { confirm: true });
    expect(status).toBe(403);
    expect(w.calls).toEqual([]);
  });
  it("passes a database refusal through", async () => {
    const w = world({ user: { id: ME, emailConfirmed: true, fullName: null, factors: [{ id: "f", type: "totp", status: "verified", createdAt: "" }] }, session: sessionState("fresh"), acceptError: { code: "P0002", message: "no open invite for your email" } });
    const { status } = await call(deps(w), "POST", "/join/finish", { confirm: true });
    expect(status).toBe(404);
  });
});
