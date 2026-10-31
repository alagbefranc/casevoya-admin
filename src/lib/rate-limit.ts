import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Per-caller request throttling with Workers Rate Limiting bindings (wrangler.jsonc "ratelimits"). This layer
 * fails open: when the binding is absent (tests, `next dev`) or cannot answer, the request is allowed. The
 * database lockouts for passwords and authenticator codes stay fail-closed and are separate.
 */
export const RATE_LIMIT_NAMES = ["ADMIN_API_READ", "ADMIN_API_WRITE", "ADMIN_SENSITIVE", "ADMIN_SETUP"] as const;
export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number];

/** The Workers Rate Limiting binding API. */
export type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };

/** Every limit has a 60 second period, so a refused caller may retry after a minute. */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;
export const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a minute and try again.";

/** Returns true when the request may go ahead. */
export type Limiter = (name: RateLimitName, key: string) => Promise<boolean>;
export type BindingLookup = (name: RateLimitName) => RateLimitBinding | undefined;

function bindingFromContext(name: RateLimitName): RateLimitBinding | undefined {
  try {
    const env: CloudflareEnv | undefined = getCloudflareContext().env;
    return env?.[name];
  } catch {
    return undefined;
  }
}

export async function rateLimit(name: RateLimitName, key: string, lookup: BindingLookup = bindingFromContext): Promise<boolean> {
  let binding: RateLimitBinding | undefined;
  try {
    binding = lookup(name);
  } catch {
    return true;
  }
  if (!binding || typeof binding.limit !== "function") return true;
  try {
    const outcome = await binding.limit({ key });
    return outcome?.success !== false;
  } catch (error) {
    console.error("rate limit check failed; request allowed", { binding: name, error: error instanceof Error ? error.name : "unknown" });
    return true;
  }
}

/** The key that identifies a caller: the verified Access subject, else the Access email. */
export function callerKey(identity: { subject?: string | null; email: string }): string {
  return identity.subject?.trim() || identity.email;
}

/** The limits the API gate applies to a request, after the Access JWT verified and before any database call. */
export function gateLimits(method: string, path: string, identity: { subject?: string | null; email: string }): [RateLimitName, string][] {
  const verb = method.toUpperCase();
  const limits: [RateLimitName, string][] = [[verb === "GET" || verb === "HEAD" ? "ADMIN_API_READ" : "ADMIN_API_WRITE", callerKey(identity)]];
  if (path === "/setup" || path.startsWith("/setup/")) limits.push(["ADMIN_SETUP", identity.email]);
  return limits;
}
