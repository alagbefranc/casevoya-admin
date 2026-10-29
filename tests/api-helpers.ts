import type { AdminEnv } from "@/lib/env";
import type { AdminRole } from "@/lib/guard";
import { AdminDenied } from "@/lib/guard";
import type { ApiDeps, Caller } from "@/lib/api/core";
import type { SessionStatus } from "@/lib/session";

export const ORIGIN = "https://admin.casevoya.ca";
export const ME = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";
export const ORG = "33333333-3333-4333-8333-333333333333";
export const ID = "44444444-4444-4444-8444-444444444444";

export const env: AdminEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseSecretKey: "test-only",
  accessTeamDomain: "team.cloudflareaccess.com",
  accessAud: "aud",
  allowedEmails: ["admin@casevoya.ca"],
  supabasePublishableKey: "sb_publishable_test",
  adminOrigin: ORIGIN,
};

export type Call = { fn: string; args: Record<string, unknown> };
type RpcResult = unknown | { error: { code: string; message: string } } | ((args: Record<string, unknown>) => unknown);

/** A fake supabase-js client: rpc() answers from a table of results; from() serves rows. */
export function fakeDb(rpcs: Record<string, RpcResult> = {}, tables: Record<string, Record<string, unknown>[]> = {}) {
  const calls: Call[] = [];
  const reads: string[] = [];
  const db = {
    calls,
    reads,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args });
      const r = rpcs[fn];
      if (r && typeof r === "object" && "error" in (r as object)) return { data: null, error: (r as { error: unknown }).error };
      return { data: typeof r === "function" ? (r as (a: Record<string, unknown>) => unknown)(args) : (r ?? null), error: null };
    },
    from: (table: string) => {
      reads.push(table);
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "range", "limit"]) builder[m] = () => builder;
      builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null, count: rows.length });
      return builder;
    },
  };
  return db;
}

export type FakeDb = ReturnType<typeof fakeDb>;

export function caller(role: AdminRole | null, db: FakeDb, opts: { templateReviewer?: boolean } = {}): Caller {
  const base = { email: "admin@casevoya.ca", subject: "s", expiresAt: 0, userId: ME, env, db: db as never };
  if (role === null) {
    return { ...base, role: null, templateReviewer: false, invite: { id: ID, role: "operator", templateReviewer: false, expiresAt: "2026-11-05T00:00:00Z" } };
  }
  return { ...base, role, templateReviewer: opts.templateReviewer ?? false };
}

export const NOW = 1_800_000_000;
export function sessionState(kind: "none" | "stale" | "fresh" | "other"): SessionStatus {
  if (kind === "none") return { signedIn: false, userId: null, aal: null, expiresAt: null, stepUpAt: null, stepUpFreshUntil: null, matchesAccessUser: false };
  return {
    signedIn: true,
    userId: kind === "other" ? OTHER : ME,
    aal: "aal2",
    expiresAt: NOW + 3000,
    stepUpAt: kind === "stale" ? NOW - 3600 : NOW - 60,
    stepUpFreshUntil: kind === "stale" ? NOW - 2700 : NOW + 840,
    matchesAccessUser: kind !== "other",
  };
}

export function deps(opts: {
  role?: AdminRole | null;
  denied?: AdminDenied;
  db?: FakeDb;
  userDb?: FakeDb;
  session?: "none" | "stale" | "fresh" | "other";
  templateReviewer?: boolean;
}): ApiDeps & { db: FakeDb; userDb: FakeDb; sessionCalls: string[] } {
  const db = opts.db ?? fakeDb();
  const userDb = opts.userDb ?? fakeDb();
  const sessionCalls: string[] = [];
  const state = sessionState(opts.session ?? "none");
  return {
    db,
    userDb,
    sessionCalls,
    gate: async (mode) => {
      if (opts.denied) throw opts.denied;
      const role = opts.role === undefined ? "owner" : opts.role;
      if (role === null && mode !== "invitee") throw new AdminDenied("not_platform_admin", "no");
      return caller(role, db, { templateReviewer: opts.templateReviewer });
    },
    sessions: {
      status: async () => state,
      signIn: async () => {
        sessionCalls.push("signIn");
        return sessionState("fresh");
      },
      stepUp: async () => {
        sessionCalls.push("stepUp");
        return sessionState("fresh");
      },
      signOut: async () => {
        sessionCalls.push("signOut");
      },
      client: async (_c, code) => {
        sessionCalls.push(code ? `client:${code}` : "client");
        return { client: userDb as never, status: sessionState("fresh") };
      },
    },
    nowSeconds: () => NOW,
    requestId: () => "req-1",
    log: () => undefined,
  };
}

export function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }), ...headers } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${ORIGIN}/api/admin${path}`, init);
}

export function auditCalls(db: FakeDb): Call[] {
  return db.calls.filter((c) => c.fn === "platform_admin_record_audit");
}
