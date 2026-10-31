import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminEnv } from "./env";
import { syncAccessPolicy, type PolicyChange } from "./access-policy";
import { sendInviteMail, type InviteMail, type MailResult } from "./invite-mail";

/**
 * What the admins endpoints need besides the database: keeping the Cloudflare Access policy in step with the admins
 * and open invites, and sending the invite email. Injected (ApiDeps.invites) so tests need no network.
 */
export type InviteOps = {
  /** Rewrites the Access policy include list to ADMIN_ALLOWED_EMAILS + every platform admin + every open invite. */
  syncAccess(env: AdminEnv, db: SupabaseClient): Promise<PolicyChange>;
  sendMail(env: AdminEnv, mail: InviteMail): Promise<MailResult>;
};

/** Emails of every platform admin and every pending, unexpired invite (service role, platform_admin_list). */
export async function memberEmails(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.rpc("platform_admin_list");
  if (error) throw new Error(`admin list failed: ${error.message}`);
  const list = (data ?? {}) as { admins?: { email?: string | null }[]; invites?: { email?: string | null; status?: string }[] };
  // The function reports a pending invite past its expiry as "expired".
  const invites = (list.invites ?? []).filter((i) => i.status === "pending").map((i) => String(i.email ?? ""));
  const admins = (list.admins ?? []).map((a) => String(a.email ?? ""));
  return [...admins, ...invites].filter(Boolean);
}

export const cloudflareInvites: InviteOps = {
  async syncAccess(env, db) {
    if (!env.invites) throw new Error("Invites are not configured on this deployment (CF_ACCOUNT_ID, CF_ACCESS_APP_ID, CF_ACCESS_POLICY_ID, CF_ADMIN_TOKEN)");
    return syncAccessPolicy(env.invites, { keep: env.allowedEmails, members: await memberEmails(db) });
  },
  async sendMail(env, mail) {
    if (!env.invites) return { sent: false, error: "Email is not configured on this deployment" };
    return sendInviteMail(env.invites, mail);
  },
};
