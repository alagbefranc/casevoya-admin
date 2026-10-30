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
  /** Raw upstream detail (database / PostgREST / Auth message) for the server log only; never sent to the browser. */
  internal?: string;
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

/** Removes bearer tokens, JWTs and Supabase keys from text before it is logged. */
export function redact(text: string): string {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, "[jwt]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key]")
    .replace(/\b(access_token|refresh_token|apikey|password)(["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi, "$1$2[redacted]")
    .slice(0, 1000);
}

export const UPSTREAM_MESSAGE = "Casevoya's database could not complete the request. Try again.";
export const STEP_UP_MESSAGE = "Enter a fresh authenticator code (step-up lasts 15 minutes)";

export type FieldIssue = { path: string; message: string };

export function zodDetails(error: ZodError): { issues: FieldIssue[] } {
  return { issues: error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })) };
}

/** A Postgres / PostgREST error from supabase-js. */
export type DbError = { code?: string | null; message: string; details?: string | null; hint?: string | null };

/**
 * Maps a database refusal to the API error codes. Only 22023 messages (raised by our own functions as
 * user-facing validation text) reach the browser; every other code gets a generic message. The raw message is
 * kept on `internal` for the server log.
 */
export function fromDbError(error: DbError): ApiError {
  const code = error.code ?? "";
  const raw = error.message || "";
  const out = mapDbError(code, raw);
  out.internal = `${code || "no-code"}: ${raw}`;
  return out;
}

function mapDbError(code: string, raw: string): ApiError {
  if (code === "42501") {
    if (/step-up|sign in with MFA/i.test(raw)) return new ApiError("step_up_required", STEP_UP_MESSAGE);
    return new ApiError("forbidden", "Casevoya's database refused this action for your account.");
  }
  if (code === "22023") return new ApiError("validation_failed", raw || "The database refused a value in this request.");
  if (["22P02", "23514", "22007", "22008", "23502", "22001", "22003"].includes(code)) {
    return new ApiError("validation_failed", "The database refused a value in this request. Check the form and try again.");
  }
  if (code === "P0002" || code === "PGRST116") return new ApiError("not_found", "Not found");
  if (code === "23505") return new ApiError("conflict", "That already exists.");
  if (code === "40001" || code === "55P03") return new ApiError("conflict", "Someone else changed this at the same time. Try again.");
  // PostgREST's PT409: the row changed since the caller read it (e.g. a template review hash mismatch).
  if (code === "PT409") return new ApiError("conflict", "This changed since you loaded it. Reload and try again.", { reload: true });
  if (code === "PGRST202") return new ApiError("upstream_error", "A database function the portal needs is missing (is the main-app migration applied?)");
  return new ApiError("upstream_error", UPSTREAM_MESSAGE);
}

export function auditResultFor(error: ApiError): "denied" | "failure" {
  return ["forbidden", "step_up_required", "session_required", "csrf_failed", "unauthenticated", "rate_limited"].includes(error.code) ? "denied" : "failure";
}
