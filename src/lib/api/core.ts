import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AdminContext, AdminRole, InviteeContext, SetupContext } from "../guard";
import { AdminDenied } from "../guard";
import type { SessionStatus } from "../session";
import type { SetupApi } from "./modules/setup";
import { ApiError, auditResultFor, fromDbError, zodDetails, type DbError, type ErrorCode } from "./errors";

/**
 * The /api/admin/* framework: one table of endpoint definitions, each with its method, path, allowed roles,
 * input schema (zod), session needs and audit action. `handle` runs every request through the same steps:
 * Access + platform_admins gate → CSRF (mutations) → role → input validation → own-session / step-up pre-check →
 * handler → audit entry (mutations, including denied and failed attempts) → JSON.
 * First-admin Setup endpoints (gate "setup") pass the setup gate instead: Access + allow list + an empty
 * platform_admins table, re-checked on every request (409 for good once any admin exists).
 */

export type Caller = AdminContext | InviteeContext | SetupContext;
/** Someone whose platform_admins row or open invite the gate found (session endpoints and the pre-check). */
export type SessionCaller = AdminContext | InviteeContext;
export type GateMode = "admin" | "invitee" | "setup";

/** The admin's own Supabase session (see src/lib/session.ts). Injected so tests need no cookies or network. */
export type SessionApi = {
  status(caller: SessionCaller): Promise<SessionStatus>;
  signIn(caller: SessionCaller, password: string, code: string): Promise<SessionStatus>;
  stepUp(caller: SessionCaller, code: string): Promise<SessionStatus>;
  signOut(caller: SessionCaller): Promise<void>;
  client(caller: SessionCaller, code?: string | null): Promise<{ client: SupabaseClient; status: SessionStatus }>;
};

export type ApiDeps = {
  gate(mode: GateMode): Promise<Caller>;
  sessions: SessionApi;
  /** First-admin Setup operations (src/lib/setup.ts). Only the setup endpoints use it. */
  setup?: SetupApi;
  nowSeconds?: () => number;
  requestId?: () => string;
  log?: (message: string, extra?: Record<string, unknown>) => void;
};

export type AuditTarget = {
  table?: string | null;
  objectId?: string | null;
  organizationId?: string | null;
  context?: Record<string, unknown>;
  /** Overrides the actor (Setup learns the user id during the request; null before the account exists). */
  actorId?: string | null;
};

export type HandlerCtx<I> = {
  /** The admin or invitee. For setup endpoints use `setupCaller` (this is then the same object, untyped for setup). */
  caller: SessionCaller;
  /** The first-admin Setup caller (gate "setup" only), else null. */
  setupCaller: SetupContext | null;
  admin: AdminContext;
  /** Service-role client. Only for reads and service-role functions. */
  db: SupabaseClient;
  input: I;
  requestId: string;
  deps: ApiDeps;
  /** The admin's own session client; steps up first when the request carried `code`. */
  userClient(): Promise<SupabaseClient>;
  /** What the audit entry names. Handlers fill it in as they learn it. */
  audit: AuditTarget;
  /** The API's logger. Never pass passwords, codes, tokens or TOTP secrets. */
  log: (message: string, extra?: Record<string, unknown>) => void;
};

export type SessionNeed = "none" | "required" | "step_up";

export type Endpoint<I = unknown> = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  summary: string;
  roles: readonly AdminRole[];
  /** "invitee" also admits someone with an open invite (accept-invite flow); "setup" is the first-admin Setup gate. */
  gate?: GateMode;
  input: z.ZodType<I>;
  session?: SessionNeed;
  /** Requires platform_admins.template_reviewer (pre-check; the database re-checks). */
  reviewer?: boolean;
  /** Every non-GET endpoint has one. Recorded as admin_portal.<action>. */
  audit?: { action: string; table?: string };
  status?: 200 | 201;
  handler(ctx: HandlerCtx<I>): Promise<unknown>;
};

export function defineEndpoint<I>(endpoint: Endpoint<I>): Endpoint<unknown> {
  return endpoint as unknown as Endpoint<unknown>;
}

export const ALL_ROLES: readonly AdminRole[] = ["owner", "operator", "viewer"];
export const OPERATORS: readonly AdminRole[] = ["owner", "operator"];
export const OWNERS: readonly AdminRole[] = ["owner"];

// ---------------------------------------------------------------------------------------------- helpers

/** Calls a database function and returns its data, or throws the mapped ApiError. */
export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw fromDbError(error as DbError);
  return data as T;
}

export function must<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new ApiError("not_found", `${what} not found`);
  return value;
}

/** Shape for every list: { items, total, limit, offset }. */
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

// ---------------------------------------------------------------------------------------------- routing

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(":")) {
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) {
      return null;
    }
  }
  return params;
}

export function route(endpoints: Endpoint[], method: string, path: string): { endpoint: Endpoint; params: Record<string, string> } | { allowed: string[] } | null {
  const allowed: string[] = [];
  for (const endpoint of endpoints) {
    const params = matchPath(endpoint.path, path);
    if (!params) continue;
    if (endpoint.method === method) return { endpoint, params };
    allowed.push(endpoint.method);
  }
  return allowed.length ? { allowed } : null;
}

function queryObject(url: URL): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

const GATE_STATUS: Record<string, ErrorCode> = {
  no_access_jwt: "unauthenticated",
  bad_access_jwt: "unauthenticated",
  email_not_allowed: "forbidden",
  no_auth_user: "forbidden",
  not_platform_admin: "forbidden",
  config: "internal",
  lookup_failed: "upstream_error",
  setup_locked: "conflict",
};

function sessionErrorToApi(error: { kind: string; message: string }): ApiError {
  switch (error.kind) {
    case "no_session":
    case "expired":
    case "mismatch":
      return new ApiError("session_required", error.message);
    case "bad_credentials":
    case "bad_code":
      return new ApiError("validation_failed", error.message, { issues: [{ path: error.kind === "bad_code" ? "code" : "password", message: error.message }] });
    case "no_factor":
      return new ApiError("forbidden", error.message);
    default:
      return new ApiError("upstream_error", error.message);
  }
}

function json(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      "x-content-type-options": "nosniff",
    },
  });
}

export function errorResponse(error: ApiError, requestId: string, extraHeaders?: Record<string, string>): Response {
  const response = json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }), requestId } }, error.status, requestId);
  for (const [k, v] of Object.entries(extraHeaders ?? {})) response.headers.set(k, v);
  return response;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------- handle

export async function handle(request: Request, endpoints: Endpoint[], deps: ApiDeps): Promise<Response> {
  const requestId = deps.requestId?.() ?? crypto.randomUUID();
  const log = deps.log ?? ((message: string, extra?: Record<string, unknown>) => console.error(message, extra ?? {}));
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin/, "") || "/";
  const found = route(endpoints, request.method.toUpperCase(), path);
  if (!found) return errorResponse(new ApiError("not_found", `No endpoint ${request.method} /api/admin${path}`), requestId);
  if ("allowed" in found) {
    return errorResponse(new ApiError("method_not_allowed", `Use ${found.allowed.join(" or ")} for /api/admin${path}`), requestId, { allow: found.allowed.join(", ") });
  }
  const { endpoint, params } = found;
  const mutation = endpoint.method !== "GET";

  // 1. Access JWT + platform_admins (or an open invite for invitee endpoints).
  let caller: Caller;
  try {
    caller = await deps.gate(endpoint.gate ?? "admin");
  } catch (error) {
    if (error instanceof AdminDenied) return errorResponse(new ApiError(GATE_STATUS[error.reason] ?? "forbidden", error.message, error.details), requestId);
    log("admin api gate failed", { requestId });
    return errorResponse(new ApiError("internal", "Unexpected error while checking access"), requestId);
  }

  const audit: AuditTarget = { table: endpoint.audit?.table ?? null };
  const finishAudit = async (result: "success" | "denied" | "failure", errorCode?: string) => {
    if (!mutation || !endpoint.audit) return;
    const { error } = await caller.db.rpc("platform_admin_record_audit", {
      p_actor: audit.actorId !== undefined ? audit.actorId : caller.userId,
      p_action: `admin_portal.${endpoint.audit.action}`,
      p_object_table: audit.table ?? null,
      p_object_id: audit.objectId && UUID_RE.test(audit.objectId) ? audit.objectId : null,
      p_organization_id: audit.organizationId && UUID_RE.test(audit.organizationId) ? audit.organizationId : null,
      p_result: result,
      p_context: { request_id: requestId, endpoint: `${endpoint.method} ${endpoint.path}`, ...(errorCode ? { error_code: errorCode } : {}), ...(audit.context ?? {}) },
    });
    if (error) log("admin api audit write failed", { requestId, action: endpoint.audit.action, error: error.message });
  };
  const fail = async (error: ApiError) => {
    await finishAudit(auditResultFor(error), error.code);
    return errorResponse(error, requestId);
  };

  // 2. CSRF: mutations come from the portal's own origin as JSON.
  if (mutation) {
    const origin = request.headers.get("origin");
    if (!origin || origin.replace(/\/$/, "") !== caller.env.adminOrigin) return fail(new ApiError("csrf_failed", "Requests that change data must come from the admin portal"));
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type)) return fail(new ApiError("csrf_failed", "Send a JSON body (content-type: application/json)"));
  }

  // 3. Role. (Setup callers are never admins: the setup gate refuses once platform_admins has a row.)
  const mode = endpoint.gate ?? "admin";
  if ("setup" in caller ? mode !== "setup" : caller.role === null ? mode !== "invitee" : mode === "setup" || !endpoint.roles.includes(caller.role)) {
    return fail(new ApiError("forbidden", caller.role ? `Your platform role (${caller.role}) cannot do this` : "Accept your invite first"));
  }
  if (endpoint.reviewer && !caller.templateReviewer) return fail(new ApiError("forbidden", "You are not flagged as a template reviewer"));

  // 4. Input.
  let raw: Record<string, unknown> = mutation ? {} : queryObject(url);
  if (mutation) {
    const text = await request.text();
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail(new ApiError("validation_failed", "The body must be a JSON object", { issues: [{ path: "", message: "The body must be a JSON object" }] }));
        raw = parsed as Record<string, unknown>;
      } catch {
        return fail(new ApiError("validation_failed", "The body is not valid JSON", { issues: [{ path: "", message: "The body is not valid JSON" }] }));
      }
    }
  }
  if (Object.keys(params).length) {
    raw = { ...raw, ...params };
    if (params.id && UUID_RE.test(params.id)) audit.objectId = params.id;
  }
  const parsed = endpoint.input.safeParse(raw);
  if (!parsed.success) return fail(new ApiError("validation_failed", parsed.error.issues[0]?.message ?? "Check the request", zodDetails(parsed.error)));
  const input = parsed.data as Record<string, unknown> | undefined;
  const code = input && typeof input.code === "string" ? input.code : null;

  // 5. Own session / step-up pre-check (the database re-checks).
  const need = endpoint.session ?? "none";
  if (need !== "none") {
    if ("setup" in caller) return fail(new ApiError("internal", "Setup endpoints check their own session"));
    const status = await deps.sessions.status(caller);
    if (!status.signedIn) return fail(new ApiError("session_required", "Sign in with your password and authenticator code first"));
    if (!status.matchesAccessUser) return fail(new ApiError("session_required", "Your admin session belongs to a different user; sign in again"));
    if (need === "step_up" && !code) {
      const now = deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
      const fresh = status.aal === "aal2" && status.stepUpFreshUntil != null && status.stepUpFreshUntil > now + 5;
      if (!fresh) return fail(new ApiError("step_up_required", "Enter a fresh authenticator code (step-up lasts 15 minutes)"));
    }
  }

  // 6. Handler.
  try {
    const ctx: HandlerCtx<unknown> = {
      caller: caller as SessionCaller,
      setupCaller: "setup" in caller ? caller : null,
      admin: caller as AdminContext,
      db: caller.db,
      input: parsed.data,
      requestId,
      deps,
      audit,
      log,
      userClient: async () => {
        if ("setup" in caller) throw new ApiError("internal", "Setup endpoints have no admin session client");
        return (await deps.sessions.client(caller, code)).client;
      },
    };
    const data = await endpoint.handler(ctx);
    await finishAudit("success");
    return json({ data: data ?? null, requestId }, endpoint.status ?? 200, requestId);
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    if (error && typeof error === "object" && "kind" in error && error instanceof Error) return fail(sessionErrorToApi(error as Error & { kind: string }));
    log("admin api handler failed", { requestId, endpoint: `${endpoint.method} ${endpoint.path}`, error: error instanceof Error ? error.message : String(error) });
    return fail(new ApiError("internal", "Unexpected error"));
  }
}
