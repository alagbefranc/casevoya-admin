import type { AdminEnv } from "@/lib/env";
import type { AdminRole } from "@/lib/guard";
import { AdminDenied } from "@/lib/guard";
import type { ApiDeps, AttemptStore, Caller } from "@/lib/api/core";
import type { InviteOps } from "@/lib/invites";
import { SessionError, type SessionStatus } from "@/lib/session";

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
  invites: { accountId: "a".repeat(32), accessAppId: "76c4d190-fcd6-498d-a63e-5e9b8a968dab", accessPolicyId: "27c25915-8305-45a6-b642-f10a8a768baf", token: "test-token-not-real-0000", mailFrom: "notices@casevoya.ca" },
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
      for (const m of ["select", "eq", "neq", "in", "order", "range", "limit"]) builder[m] = () => builder;
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
  /**
   * Failed attempts already recorded for the admin in the lockout window, or an error the reservation throws.
   * Omitted: no lockout store. The fake store follows the database contract: pending reservations count as failures.
   */
  badAttempts?: number | Error;
  /** Makes the fake store's resolve() throw. */
  resolveError?: Error;
  /** Replaces the session client (e.g. to throw a SessionError). */
  client?: ApiDeps["sessions"]["client"];
  /** Replaces the session status (e.g. to throw). */
  status?: ApiDeps["sessions"]["status"];
  /** Passwords or codes the fake signIn / stepUp refuse (SessionError bad_credentials / bad_code). */
  reject?: string[];
  /** Replaces the fake Access sync / invite mail. */
  invites?: Partial<InviteOps>;
}): ApiDeps & {
  /** "sync" and "mail:<to>" in call order. */
  inviteCalls: string[];
  db: FakeDb;
  userDb: FakeDb;
  sessionCalls: string[];
  logs: { message: string; extra?: Record<string, unknown> }[];
  /** "reserve:<kind>" and "resolve:<succeeded>" in call order. */
  attemptCalls: string[];
  /** Reservations the fake store holds: succeeded null while pending. */
  attemptRows: { id: string; kind: string; succeeded: boolean | null }[];
} {
  const db = opts.db ?? fakeDb();
  const userDb = opts.userDb ?? fakeDb();
  const sessionCalls: string[] = [];
  const logs: { message: string; extra?: Record<string, unknown> }[] = [];
  const attemptCalls: string[] = [];
  const attemptRows: { id: string; kind: string; succeeded: boolean | null }[] = [];
  const state = sessionState(opts.session ?? "none");
  const inviteCalls: string[] = [];
  const invites: InviteOps = {
    syncAccess: async (e, d) => {
      inviteCalls.push("sync");
      if (opts.invites?.syncAccess) return opts.invites.syncAccess(e, d);
      return { before: ["admin@casevoya.ca"], after: ["admin@casevoya.ca"], added: [], removed: [], changed: false };
    },
    sendMail: async (e, m) => {
      inviteCalls.push(`mail:${m.to}`);
      if (opts.invites?.sendMail) return opts.invites.sendMail(e, m);
      return { sent: true, messageId: "m-1" };
    },
  };
  const bad = opts.badAttempts;
  const attempts: AttemptStore = {
    reserve: async (_c, kind) => {
      attemptCalls.push(`reserve:${kind}`);
      if (bad instanceof Error) throw bad;
      const failures = (bad ?? 0) + attemptRows.filter((r) => r.succeeded !== true).length;
      if (failures >= 5) return { allowed: false, attemptId: null, retryAfterSeconds: 900 };
      const id = `00000000-0000-4000-8000-${String(attemptRows.length + 1).padStart(12, "0")}`;
      attemptRows.push({ id, kind, succeeded: null });
      return { allowed: true, attemptId: id, retryAfterSeconds: 0 };
    },
    resolve: async (_c, id, succeeded) => {
      attemptCalls.push(`resolve:${succeeded}`);
      if (opts.resolveError) throw opts.resolveError;
      const row = attemptRows.find((r) => r.id === id);
      if (row && row.succeeded === null) row.succeeded = succeeded;
    },
  };
  return {
    db,
    userDb,
    sessionCalls,
    logs,
    attemptCalls,
    attemptRows,
    inviteCalls,
    invites,
    ...(bad === undefined ? {} : { attempts }),
    gate: async (mode) => {
      if (opts.denied) throw opts.denied;
      const role = opts.role === undefined ? "owner" : opts.role;
      if (role === null && mode !== "invitee") throw new AdminDenied("not_platform_admin", "no");
      return caller(role, db, { templateReviewer: opts.templateReviewer });
    },
    sessions: {
      status: opts.status ?? (async () => state),
      signIn: async (_c, password, code) => {
        sessionCalls.push("signIn");
        if (opts.reject?.includes(password)) throw new SessionError("bad_credentials", "Email or password was not accepted.");
        if (opts.reject?.includes(code)) throw new SessionError("bad_code", "That authenticator code was not accepted.");
        return sessionState("fresh");
      },
      stepUp: async (_c, code) => {
        sessionCalls.push("stepUp");
        if (opts.reject?.includes(code)) throw new SessionError("bad_code", "That authenticator code was not accepted.");
        return sessionState("fresh");
      },
      signOut: async () => {
        sessionCalls.push("signOut");
      },
      client:
        opts.client ??
        (async (_c, code) => {
          sessionCalls.push(code ? `client:${code}` : "client");
          return { client: userDb as never, status: sessionState("fresh") };
        }),
    },
    nowSeconds: () => NOW,
    requestId: () => "req-1",
    log: (message, extra) => {
      logs.push({ message, extra });
    },
  };
}

/** Audit entries without the "started" rows that high-risk actions write first. */
export function outcomeAudits(db: FakeDb): Call[] {
  return auditCalls(db).filter((c) => !String(c.args.p_action).endsWith(".started"));
}

export function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = { method, headers: { ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }), ...headers } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${ORIGIN}/api/admin${path}`, init);
}

export function auditCalls(db: FakeDb): Call[] {
  return db.calls.filter((c) => c.fn === "platform_admin_record_audit");
}
