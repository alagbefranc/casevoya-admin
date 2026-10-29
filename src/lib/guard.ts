import "server-only";
import { headers } from "next/headers";
import { ACCESS_HEADER, AccessDenied, verifyAccessJwt, type AccessIdentity } from "./access";
import { ConfigError, readEnv, type AdminEnv } from "./env";
import { authUserIdByEmail, serviceClient } from "./supabase";
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

export type GateReason =
  | "config"
  | "no_access_jwt"
  | "bad_access_jwt"
  | "email_not_allowed"
  | "no_auth_user"
  | "not_platform_admin"
  | "lookup_failed";

export class AdminDenied extends Error {
  constructor(readonly reason: GateReason, message: string) {
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

async function identify(deps: GateDeps): Promise<{ identity: AccessIdentity; userId: string; db: SupabaseClient }> {
  const verify = deps.verify ?? verifyAccessJwt;
  let identity: AccessIdentity;
  try {
    identity = await verify(deps.token, {
      teamDomain: deps.env.accessTeamDomain,
      aud: deps.env.accessAud,
      allowedEmails: deps.env.allowedEmails,
    });
  } catch (error) {
    if (error instanceof AccessDenied) throw new AdminDenied(error.reason, error.message);
    throw new AdminDenied("bad_access_jwt", "The Cloudflare Access token did not verify");
  }
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

/** For the API: the admin gate, or the invitee gate (admins and people with an open invite). */
export async function requireCaller(mode: "admin" | "invitee"): Promise<AdminContext | InviteeContext> {
  let env: AdminEnv;
  try {
    env = readEnv();
  } catch (error) {
    throw new AdminDenied("config", error instanceof ConfigError ? error.message : "Configuration error");
  }
  const token = (await headers()).get(ACCESS_HEADER);
  return mode === "invitee" ? evaluateInviteeGate({ token, env }) : evaluateGate({ token, env });
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
