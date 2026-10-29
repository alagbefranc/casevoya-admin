import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminEnv } from "./env";

/**
 * The service-role client. It only ever exists on the server (this module is server-only and the
 * key is a Worker secret). Callers must have passed requireAdmin() first.
 */
export function serviceClient(env: AdminEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-casevoya-client": "casevoya-admin" } },
  });
}

/** Finds the auth.users id for an exact email through the Auth admin API. */
export async function authUserIdByEmail(env: AdminEnv, email: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const url = `${env.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200&filter=${encodeURIComponent(target)}`;
    const response = await fetcher(url, {
      headers: { apikey: env.supabaseSecretKey, Authorization: `Bearer ${env.supabaseSecretKey}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`auth admin users: HTTP ${response.status}`);
    const body = (await response.json()) as { users?: { id: string; email?: string | null }[] };
    const users = body.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (users.length < 200) return null;
  }
  return null;
}
