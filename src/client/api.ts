/**
 * Browser client for /api/admin (docs/FRONTEND-SPEC.md 1.1). Same origin, cookies ride along, JSON in and out.
 * Every failure becomes an ApiFailure with the API's error code, message, details and request id.
 */
export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "session_required"
  | "step_up_required"
  | "csrf_failed"
  | "validation_failed"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "upstream_error"
  | "internal"
  | "network";

export type Issue = { path: string; message: string };

export class ApiFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
  get issues(): Issue[] {
    const raw = (this.details as { issues?: unknown } | null)?.issues;
    return Array.isArray(raw) ? (raw as Issue[]).filter((i) => i && typeof i.path === "string") : [];
  }
}

export const BASE = "/api/admin";

/** Builds `/path?a=b` from a params object, dropping empty values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export async function apiRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "same-origin",
      redirect: "manual",
      cache: "no-store",
      headers: method === "GET" ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiFailure("network", "Casevoya admin could not be reached.", 0, null);
  }
  // Access redirects to its login when its session ends at the edge (opaque redirect or HTML).
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    throw new ApiFailure("unauthenticated", "Your Cloudflare Access sign-in ended.", res.status, null);
  }
  const requestId = res.headers.get("x-request-id");
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new ApiFailure("unauthenticated", "Your Cloudflare Access sign-in ended.", res.status, requestId);
  }
  let json: { data?: T; error?: { code: ErrorCode; message: string; details?: Record<string, unknown>; requestId?: string } };
  try {
    json = await res.json();
  } catch {
    throw new ApiFailure("internal", "The response could not be read.", res.status, requestId);
  }
  if (!res.ok || json.error) {
    const e = json.error ?? { code: "internal" as ErrorCode, message: `Request failed (${res.status})` };
    throw new ApiFailure(e.code, capitalise(e.message), res.status, e.requestId ?? requestId, e.details ?? null);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>("PATCH", path, body ?? {}),
};

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Plain-language text for an error (spec 1.1 table). */
export function describe(error: unknown): { title: string; body: string; requestId: string | null } {
  if (!(error instanceof ApiFailure)) return { title: "Something went wrong", body: String((error as Error)?.message ?? error), requestId: null };
  switch (error.code) {
    case "upstream_error":
      return { title: "Casevoya's database did not answer", body: "Try again. Nothing was changed.", requestId: error.requestId };
    case "internal":
      return { title: "Casevoya's database did not answer", body: `Try again. Nothing was changed.${error.requestId ? ` Quote this reference: ${error.requestId}` : ""}`, requestId: error.requestId };
    case "csrf_failed":
    case "method_not_allowed":
      return { title: "This request was blocked", body: "Reload the page and try again.", requestId: error.requestId };
    case "network":
      return { title: "Casevoya admin could not be reached", body: "Check your connection and try again.", requestId: null };
    default:
      return { title: error.message, body: "", requestId: error.requestId };
  }
}
