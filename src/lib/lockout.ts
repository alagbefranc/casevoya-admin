import "server-only";
import type { AttemptReservation, AttemptStore } from "./api/core";
import { CODE_LOCKOUT_MINUTES } from "./api/core";

/**
 * Attempt lockout for authenticator codes and sign-in passwords on the admin API (src/lib/api/core.ts). Each attempt
 * is reserved atomically in the database (platform_admin_reserve_attempt, service role, per-user lock) before the
 * code or password is tried, then resolved with the outcome. Unresolved reservations count as failures.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the RPC's jsonb answer; anything unexpected throws (the caller then refuses the attempt). */
export function parseReservation(data: unknown): AttemptReservation {
  const row = data as { allowed?: unknown; attempt_id?: unknown; retry_after_seconds?: unknown } | null;
  if (!row || typeof row !== "object" || typeof row.allowed !== "boolean") throw new Error("attempt reservation returned an unexpected shape");
  const retry = typeof row.retry_after_seconds === "number" && Number.isFinite(row.retry_after_seconds) && row.retry_after_seconds > 0 ? Math.ceil(row.retry_after_seconds) : CODE_LOCKOUT_MINUTES * 60;
  if (!row.allowed) return { allowed: false, attemptId: null, retryAfterSeconds: retry };
  if (typeof row.attempt_id !== "string" || !UUID_RE.test(row.attempt_id)) throw new Error("attempt reservation allowed without an attempt id");
  return { allowed: true, attemptId: row.attempt_id, retryAfterSeconds: 0 };
}

export const rpcAttemptStore: AttemptStore = {
  async reserve(caller, kind) {
    const { data, error } = await caller.db.rpc("platform_admin_reserve_attempt", { p_user: caller.userId, p_kind: kind });
    if (error) throw new Error(`attempt reservation failed: ${error.message}`);
    return parseReservation(data);
  },
  async resolve(caller, attemptId, succeeded) {
    const { error } = await caller.db.rpc("platform_admin_resolve_attempt", { p_attempt: attemptId, p_succeeded: succeeded });
    if (error) throw new Error(`attempt resolution failed: ${error.message}`);
  },
};
