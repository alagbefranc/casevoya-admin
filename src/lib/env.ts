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
  };
  if (missing.length) throw new ConfigError(`Missing configuration: ${missing.join(", ")}`);
  if (!env.allowedEmails.length) throw new ConfigError("ADMIN_ALLOWED_EMAILS names nobody");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.supabaseUrl)) throw new ConfigError("SUPABASE_URL is not a Supabase project URL");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.accessTeamDomain)) throw new ConfigError("CF_ACCESS_TEAM_DOMAIN is not a cloudflareaccess.com team domain");
  return env;
}

export function parseEmails(value: string): string[] {
  return [...new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))];
}
