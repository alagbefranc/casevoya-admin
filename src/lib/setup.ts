import "server-only";
import type { User } from "@supabase/supabase-js";
import type { SetupApi, SetupFactor, SetupUser } from "./api/modules/setup";
import { enrolTotp, setupSessionStatus, signInWithPasswordOnly, verifyTotp } from "./session";

/**
 * The real first-admin Setup operations (service role for the Auth admin API, the user's own session for
 * enrolment and verification). Nothing here logs; errors carry Supabase's message, never a password or secret.
 */

function fullNameOf(user: User): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = meta.full_name ?? meta.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export const supabaseSetup: SetupApi = {
  async getUser(caller, userId) {
    const { data, error } = await caller.db.auth.admin.getUserById(userId);
    if (error) {
      if (error.status === 404) return null;
      throw new Error(`auth admin user lookup failed: ${error.message}`);
    }
    const user = data.user;
    if (!user || (user.email ?? "").toLowerCase() !== caller.email) return null;
    const listed = await caller.db.auth.admin.mfa.listFactors({ userId });
    if (listed.error) throw new Error(`auth admin factor list failed: ${listed.error.message}`);
    const factors: SetupFactor[] = (listed.data?.factors ?? []).map((f) => ({
      id: f.id,
      type: String(f.factor_type),
      status: String(f.status),
      createdAt: String(f.created_at ?? ""),
    }));
    return { id: user.id, emailConfirmed: Boolean(user.email_confirmed_at), fullName: fullNameOf(user), factors } satisfies SetupUser;
  },

  async createUser(caller, input) {
    const { data, error } = await caller.db.auth.admin.createUser({
      email: caller.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error || !data.user) throw new Error(error?.message ?? "The account could not be created");
    return { id: data.user.id, emailConfirmed: true, fullName: input.fullName, factors: [] };
  },

  async updateUser(caller, userId, patch) {
    const attrs: { password?: string; user_metadata?: Record<string, unknown>; email_confirm?: boolean } = {};
    if (patch.password) attrs.password = patch.password;
    // Auth merges user_metadata keys, so other metadata is kept.
    if (patch.fullName) attrs.user_metadata = { full_name: patch.fullName };
    if (patch.confirmEmail) attrs.email_confirm = true;
    if (!Object.keys(attrs).length) return;
    const { error } = await caller.db.auth.admin.updateUserById(userId, attrs);
    if (error) throw new Error(`auth admin update failed: ${error.message}`);
  },

  signIn: (target, password) => signInWithPasswordOnly(target, password),
  session: (target) => setupSessionStatus(target),
  enrol: (target) => enrolTotp(target),
  verify: (target, factorId, code) => verifyTotp(target, factorId, code),

  async deleteFactor(caller, userId, factorId) {
    const listed = await caller.db.auth.admin.mfa.listFactors({ userId });
    if (listed.error) throw new Error(`auth admin factor list failed: ${listed.error.message}`);
    const factor = (listed.data?.factors ?? []).find((f) => f.id === factorId);
    if (!factor) return;
    // Safety: Setup only ever removes a factor that was never verified.
    if (factor.status === "verified") throw new Error("refusing to remove a verified factor");
    const { error } = await caller.db.auth.admin.mfa.deleteFactor({ id: factorId, userId });
    if (error) throw new Error(`auth admin factor delete failed: ${error.message}`);
  },

  async deleteAllFactors(caller, userId) {
    // Used only when taking over an unconfirmed account: nothing a prior holder enrolled may survive.
    const listed = await caller.db.auth.admin.mfa.listFactors({ userId });
    if (listed.error) throw new Error(`auth admin factor list failed: ${listed.error.message}`);
    const factors = listed.data?.factors ?? [];
    for (const factor of factors) {
      const { error } = await caller.db.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
      if (error) throw new Error(`auth admin factor delete failed: ${error.message}`);
    }
    return factors.length;
  },

  async recentBadAttempts(caller, sinceIso) {
    const { count, error } = await caller.db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .in("action", ["admin_portal.setup.account", "admin_portal.setup.authenticator_verified"])
      .eq("result", "failure")
      .gte("occurred_at", sinceIso)
      .eq("context->>setup_email", caller.email)
      .not("context->>setup_bad_attempt", "is", null);
    if (error) throw new Error(`setup attempt count failed: ${error.message}`);
    return count ?? 0;
  },
};
