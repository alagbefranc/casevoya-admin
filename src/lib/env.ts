import "server-only";

/**
 * Server-side configuration. Every value comes from the Worker's vars and secrets at request time
 * (OpenNext copies them onto process.env). Nothing here has the public prefix, so nothing is inlined into
 * the browser bundle.
 */
export type AdminEnv = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  accessTeamDomain: string;
  accessAud: string;
  allowedEmails: string[];
  /** Publishable (anon) key. Used only to sign a template reviewer into their own Supabase session. */
  supabasePublishableKey: string | null;
  /**
   * Admins flagged as the licensed template reviewer (TEMPLATE_REVIEWER_EMAILS). Only they see and can use
   * approve/reject. Empty means nobody can review yet. The database still re-checks the licence.
   */
  reviewerEmails: string[];
};

export class ConfigError extends Error {}

export function readEnv(source: Record<string, string | undefined> = process.env): AdminEnv {
  const missing: string[] = [];
  const get = (name: string) => {
    const value = source[name]?.trim();
    if (!value) missing.push(name);
    return value ?? "";
  };
  const env = {
    supabaseUrl: get("SUPABASE_URL"),
    supabaseSecretKey: get("SUPABASE_SECRET_KEY"),
    accessTeamDomain: get("CF_ACCESS_TEAM_DOMAIN"),
    accessAud: get("CF_ACCESS_AUD"),
    allowedEmails: parseEmails(get("ADMIN_ALLOWED_EMAILS")),
    supabasePublishableKey: source.SUPABASE_PUBLISHABLE_KEY?.trim() || null,
    reviewerEmails: parseEmails(source.TEMPLATE_REVIEWER_EMAILS ?? ""),
  };
  if (missing.length) throw new ConfigError(`Missing configuration: ${missing.join(", ")}`);
  if (!env.allowedEmails.length) throw new ConfigError("ADMIN_ALLOWED_EMAILS names nobody");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.supabaseUrl)) throw new ConfigError("SUPABASE_URL is not a Supabase project URL");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.accessTeamDomain)) throw new ConfigError("CF_ACCESS_TEAM_DOMAIN is not a cloudflareaccess.com team domain");
  if (env.supabasePublishableKey && !/^(sb_publishable_|eyJ)/.test(env.supabasePublishableKey)) {
    throw new ConfigError("SUPABASE_PUBLISHABLE_KEY is not a publishable key");
  }
  const strangers = env.reviewerEmails.filter((email) => !env.allowedEmails.includes(email));
  if (strangers.length) throw new ConfigError("TEMPLATE_REVIEWER_EMAILS names someone who is not on ADMIN_ALLOWED_EMAILS");
  return env;
}

export function parseEmails(value: string): string[] {
  return [...new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))];
}
