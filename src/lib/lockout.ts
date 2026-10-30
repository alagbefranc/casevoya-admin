import "server-only";
import type { AttemptStore } from "./api/core";

/**
 * Attempt lockout for authenticator codes and sign-in passwords on the admin API (src/lib/api/core.ts). Counts the
 * portal's own failed audit entries marked bad_attempt for this admin, like the Setup lockout (src/lib/setup.ts).
 */
export const auditAttemptStore: AttemptStore = {
  async recentBadAttempts(caller, sinceIso) {
    const { count, error } = await caller.db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .like("action", "admin_portal.%")
      .eq("result", "failure")
      .gte("occurred_at", sinceIso)
      .eq("context->>attempt_user_id", caller.userId)
      .not("context->>bad_attempt", "is", null);
    if (error) throw new Error(`attempt count failed: ${error.message}`);
    return count ?? 0;
  },
};
