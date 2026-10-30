import type { ZodError } from "zod";

/** The one error shape every /api/admin/* response uses: { error: { code, message, details?, requestId } }. */
export const ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  step_up_required: 403,
  session_required: 401,
  csrf_failed: 403,
  validation_failed: 422,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  rate_limited: 429,
  upstream_error: 502,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export type FieldIssue = { path: string; message: string };

export function zodDetails(error: ZodError): { issues: FieldIssue[] } {
  return { issues: error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })) };
}

/** A Postgres / PostgREST error from supabase-js. */
export type DbError = { code?: string | null; message: string; details?: string | null; hint?: string | null };

/**
 * Maps a database refusal to the API error codes. The database is the authority: its message is passed through
 * (it is written for operators and never contains client content).
 */
export function fromDbError(error: DbError): ApiError {
  const code = error.code ?? "";
  const message = error.message || "The database refused the request";
  if (code === "42501") {
    if (/step-up|sign in with MFA/i.test(message)) return new ApiError("step_up_required", message);
    return new ApiError("forbidden", message);
  }
  if (["22023", "22P02", "23514", "22007", "22008", "23502", "22001", "22003"].includes(code)) return new ApiError("validation_failed", message);
  if (code === "P0002" || code === "PGRST116") return new ApiError("not_found", message);
  if (code === "23505" || code === "40001" || code === "55P03") return new ApiError("conflict", message);
  // PostgREST's PT409: the row changed since the caller read it (e.g. a template review hash mismatch).
  if (code === "PT409") return new ApiError("conflict", message, { reload: true });
  if (code === "PGRST202") return new ApiError("upstream_error", "A database function the portal needs is missing (is the main-app migration applied?)");
  return new ApiError("upstream_error", message);
}

export function auditResultFor(error: ApiError): "denied" | "failure" {
  return ["forbidden", "step_up_required", "session_required", "csrf_failed", "unauthenticated", "rate_limited"].includes(error.code) ? "denied" : "failure";
}
