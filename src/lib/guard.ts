import "server-only";
import { headers } from "next/headers";
import { ACCESS_HEADER, AccessDenied, verifyAccessJwt, type AccessIdentity } from "./access";
import { ConfigError, readEnv, type AdminEnv } from "./env";
import { authUserIdByEmail, serviceClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminContext = AccessIdentity & { userId: string; env: AdminEnv; db: SupabaseClient };

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
  isPlatformAdmin?: (db: SupabaseClient, userId: string) => Promise<boolean>;
  makeClient?: (env: AdminEnv) => SupabaseClient;
};

export async function platformAdminRow(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new AdminDenied("lookup_failed", `platform_admins lookup failed: ${error.message}`);
  return Boolean(data);
}

/**
 * The two checks every page and every server action runs, in order:
 * 1. a valid Cloudflare Access JWT for this application whose email is on ADMIN_ALLOWED_EMAILS;
 * 2. that email's auth.users id has a row in public.platform_admins.
 */
export async function evaluateGate(deps: GateDeps): Promise<AdminContext> {
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
  const db = (deps.makeClient ?? serviceClient)(deps.env);
  const member = await (deps.isPlatformAdmin ?? platformAdminRow)(db, userId);
  if (!member) throw new AdminDenied("not_platform_admin", "This user is not a platform admin");
  return { ...identity, userId, env: deps.env, db };
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

/** For pages: the same checks, returned as a result so the page can explain a refusal. */
export async function gate(): Promise<{ ok: true; admin: AdminContext } | { ok: false; reason: GateReason; message: string }> {
  try {
    return { ok: true, admin: await requireAdmin() };
  } catch (error) {
    if (error instanceof AdminDenied) return { ok: false, reason: error.reason, message: error.message };
    return { ok: false, reason: "lookup_failed", message: "Unexpected error" };
  }
}
