import "server-only";
import { headers } from "next/headers";
import { ACCESS_HEADER, AccessDenied, verifyAccessJwt, type AccessIdentity } from "./access";
import { ConfigError, readEnv, type AdminEnv } from "./env";
import { authUserIdByEmail, serviceClient } from "./supabase";
import { RATE_LIMITED_MESSAGE, RATE_LIMIT_RETRY_AFTER_SECONDS, gateLimits, rateLimit, type Limiter } from "./rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminRole = "owner" | "operator" | "viewer";
export const ADMIN_ROLES: readonly AdminRole[] = ["owner", "operator", "viewer"];

/** The caller's platform_admins row: their portal role and whether they may publish shared templates. */
export type AdminRecord = { role: AdminRole; templateReviewer: boolean };

export type AdminContext = AccessIdentity & { userId: string; env: AdminEnv; db: SupabaseClient } & AdminRecord;

/** Someone with an open platform admin invite who has not accepted it yet (only the accept flow admits them). */
export type InviteeContext = AccessIdentity & {
  userId: string;
  env: AdminEnv;
  db: SupabaseClient;
  role: null;
  templateReviewer: false;
  invite: { id: string; role: AdminRole; templateReviewer: boolean; expiresAt: string };
};

/**
 * The caller of a first-admin Setup endpoint: a valid Access JWT for an allow-listed email while
 * public.platform_admins is still empty. They may not have an auth user yet (userId null).
 */
export type SetupContext = AccessIdentity & {
  userId: string | null;
  env: AdminEnv;
  db: SupabaseClient;
  role: null;
  templateReviewer: false;
  setup: true;
};

export type GateReason =
  | "config"
  | "setup_locked"
  | "no_access_jwt"
  | "bad_access_jwt"
  | "email_not_allowed"
  | "no_auth_user"
  | "not_platform_admin"
  | "lookup_failed"
  | "rate_limited";

export class AdminDenied extends Error {
  constructor(
    readonly reason: GateReason,
    message: string,
    /** Safe, non-secret facts for the client (setup_locked and rate_limited refusals). */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Dependencies, so the gate can be tested without a request or a network. */
export type GateDeps = {
  token: string | null;
  env: AdminEnv;
  verify?: typeof verifyAccessJwt;
  lookupUser?: (env: AdminEnv, email: string) => Promise<string | null>;
  /** The caller's platform_admins row, or null. */
  adminRecord?: (db: SupabaseClient, userId: string) => Promise<AdminRecord | null>;
  makeClient?: (env: AdminEnv) => SupabaseClient;
  /** The API request being gated (method and path under /api/admin). When set, the per-caller rate limits apply. */
  request?: { method: string; path: string };
  limiter?: Limiter;
};

export async function platformAdminRow(db: SupabaseClient, userId: string): Promise<AdminRecord | null> {
  const { data, error } = await db.from("platform_admins").select("user_id, role, template_reviewer").eq("user_id", userId).maybeSingle();
  if (error) throw new AdminDenied("lookup_failed", `platform_admins lookup failed: ${error.message}`);
  if (!data) return null;
  const role = ADMIN_ROLES.includes(data.role as AdminRole) ? (data.role as AdminRole) : "viewer";
  return { role, templateReviewer: data.template_reviewer === true };
}

/** The open invite for an email (service role), or null. */
export async function openInvite(db: SupabaseClient, email: string): Promise<InviteeContext["invite"] | null> {
  const { data, error } = await db.rpc("platform_admin_invite_for_email", { p_email: email });
  if (error) throw new AdminDenied("lookup_failed", `invite lookup failed: ${error.message}`);
  // The function only returns a pending, unexpired invite.
  const row = data as { id?: string; role?: string; template_reviewer?: boolean; expires_at?: string } | null;
  if (!row?.id) return null;
  return {
    id: row.id,
    role: ADMIN_ROLES.includes(row.role as AdminRole) ? (row.role as AdminRole) : "viewer",
    templateReviewer: row.template_reviewer === true,
    expiresAt: String(row.expires_at ?? ""),
  };
}

/**
 * The two checks every page and every server action runs, in order:
 * 1. a valid Cloudflare Access JWT for this application whose email is on ADMIN_ALLOWED_EMAILS;
 * 2. that email's auth.users id has a row in public.platform_admins (which also gives the portal role).
 */
export async function evaluateGate(deps: GateDeps): Promise<AdminContext> {
  const { identity, userId, db } = await identify(deps);
  const record = await (deps.adminRecord ?? platformAdminRow)(db, userId);
  if (!record) throw new AdminDenied("not_platform_admin", "This user is not a platform admin");
  return { ...identity, userId, env: deps.env, db, ...record };
}

/** Like evaluateGate, but also admits someone with an open invite (for the accept-invite flow only). */
export async function evaluateInviteeGate(
  deps: GateDeps & { invite?: (db: SupabaseClient, email: string) => Promise<InviteeContext["invite"] | null> },
): Promise<AdminContext | InviteeContext> {
  const { identity, userId, db } = await identify(deps);
  const record = await (deps.adminRecord ?? platformAdminRow)(db, userId);
  if (record) return { ...identity, userId, env: deps.env, db, ...record };
  const invite = await (deps.invite ?? openInvite)(db, identity.email);
  if (!invite) throw new AdminDenied("not_platform_admin", "This user is not a platform admin and has no open invite");
  return { ...identity, userId, env: deps.env, db, role: null, templateReviewer: false, invite };
}

/** How many platform admins exist, and when the first was added (service role). */
export async function platformAdminCount(db: SupabaseClient): Promise<{ count: number; firstAt: string | null }> {
  const { data, error, count } = await db
    .from("platform_admins")
    .select("created_at", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new AdminDenied("lookup_failed", `platform_admins count failed: ${error.message}`);
  const rows = (data ?? []) as { created_at?: string | null }[];
  return { count: count ?? rows.length, firstAt: rows[0]?.created_at ?? null };
}

export const SETUP_LOCKED_MESSAGE = "Setup is locked: the first platform admin already exists. Ask an owner to invite you.";

/**
 * The first-admin Setup gate, checked on the server for every setup request:
 * 1. a valid Cloudflare Access JWT for an email on ADMIN_ALLOWED_EMAILS;
 * 2. public.platform_admins is empty. Otherwise it refuses with setup_locked (409) for good.
 * The auth user may not exist yet.
 */
export async function evaluateSetupGate(
  deps: GateDeps & { countAdmins?: (db: SupabaseClient) => Promise<{ count: number; firstAt: string | null }> },
): Promise<SetupContext> {
  const identity = await verifyIdentity(deps);
  await throttle(deps, identity);
  const db = (deps.makeClient ?? serviceClient)(deps.env);
  let admins: { count: number; firstAt: string | null };
  try {
    admins = await (deps.countAdmins ?? platformAdminCount)(db);
  } catch (error) {
    if (error instanceof AdminDenied) throw error;
    throw new AdminDenied("lookup_failed", "Could not check whether setup has been done");
  }
  if (admins.count > 0) throw new AdminDenied("setup_locked", SETUP_LOCKED_MESSAGE, { locked: true, lockedAt: admins.firstAt });
  let userId: string | null;
  try {
    userId = await (deps.lookupUser ?? authUserIdByEmail)(deps.env, identity.email);
  } catch {
    throw new AdminDenied("lookup_failed", "Could not look up the admin's user record");
  }
  return { ...identity, userId, env: deps.env, db, role: null, templateReviewer: false, setup: true };
}

async function verifyIdentity(deps: GateDeps): Promise<AccessIdentity> {
  const verify = deps.verify ?? verifyAccessJwt;
  try {
    return await verify(deps.token, {
      teamDomain: deps.env.accessTeamDomain,
      aud: deps.env.accessAud,
      allowedEmails: deps.env.allowedEmails,
    });
  } catch (error) {
    if (error instanceof AccessDenied) throw new AdminDenied(error.reason, error.message);
    throw new AdminDenied("bad_access_jwt", "The Cloudflare Access token did not verify");
  }
}

/** Per-caller rate limits for API requests, checked on the verified identity before any Auth or database lookup. */
async function throttle(deps: GateDeps, identity: AccessIdentity): Promise<void> {
  if (!deps.request) return;
  const limiter = deps.limiter ?? rateLimit;
  for (const [name, key] of gateLimits(deps.request.method, deps.request.path, identity)) {
    if (!(await limiter(name, key))) {
      throw new AdminDenied("rate_limited", RATE_LIMITED_MESSAGE, { retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS });
    }
  }
}

async function identify(deps: GateDeps): Promise<{ identity: AccessIdentity; userId: string; db: SupabaseClient }> {
  const identity = await verifyIdentity(deps);
  await throttle(deps, identity);
  let userId: string | null;
  try {
    userId = await (deps.lookupUser ?? authUserIdByEmail)(deps.env, identity.email);
  } catch {
    throw new AdminDenied("lookup_failed", "Could not look up the admin's user record");
  }
  if (!userId) throw new AdminDenied("no_auth_user", "No Casevoya user exists for this email yet");
  return { identity, userId, db: (deps.makeClient ?? serviceClient)(deps.env) };
}

/** For server actions and pages: throws AdminDenied unless both checks pass. */
export async function requireAdmin(): Promise<AdminContext> {
  let env: AdminEnv;
  try {
    env = readEnv();
  } catch (error) {
    throw new AdminDenied("config", error instanceof ConfigError ? error.message : "Configuration error");
  }
  const token = (await headers()).get(ACCESS_HEADER);
  return evaluateGate({ token, env });
}

/** For the API: the admin gate, the invitee gate (admins and people with an open invite), or the first-admin setup gate. */
export async function requireCaller(
  mode: "admin" | "invitee" | "setup",
  request?: { method: string; path: string },
): Promise<AdminContext | InviteeContext | SetupContext> {
  let env: AdminEnv;
  try {
    env = readEnv();
  } catch (error) {
    throw new AdminDenied("config", error instanceof ConfigError ? error.message : "Configuration error");
  }
  const token = (await headers()).get(ACCESS_HEADER);
  if (mode === "setup") return evaluateSetupGate({ token, env, request });
  return mode === "invitee" ? evaluateInviteeGate({ token, env, request }) : evaluateGate({ token, env, request });
}

/** For pages: the same checks, returned as a result so the page can explain a refusal. */
export async function gate(): Promise<{ ok: true; admin: AdminContext } | { ok: false; reason: GateReason; message: string }> {
  try {
    return { ok: true, admin: await requireAdmin() };
  } catch (error) {
    if (error instanceof AdminDenied) return { ok: false, reason: error.reason, message: error.message };
    return { ok: false, reason: "lookup_failed", message: "Unexpected error" };
  }
}
