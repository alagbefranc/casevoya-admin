import "server-only";
import { cookies } from "next/headers";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "./guard";
import { peekJwt } from "./templates";

/**
 * The template reviewer's OWN Supabase session. approve/reject_shared_template_version refuse the service role and
 * read auth.uid(), aal2 and a TOTP verified in the last 15 minutes, so the reviewer signs in here with their own
 * password and authenticator code. The tokens live in one httpOnly, Secure, SameSite=Strict, host-only cookie for at
 * most an hour, and the session is only ever used for those two RPCs. It is always tied to the Access identity:
 * the session's user must be the same auth user as the Access email.
 */
const COOKIE = "__Host-cv-reviewer";
const MAX_AGE_SECONDS = 60 * 60;

export class ReviewerError extends Error {}

function userClient(admin: AdminContext): SupabaseClient {
  const key = admin.env.supabasePublishableKey;
  if (!key) throw new ReviewerError("The Worker has no SUPABASE_PUBLISHABLE_KEY; reviewer sign-in is unavailable.");
  return createClient(admin.env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-casevoya-client": "casevoya-admin-reviewer" } },
  });
}

async function store(session: Session): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify({ a: session.access_token, r: session.refresh_token }), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearReviewerSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

async function readTokens(): Promise<{ a: string; r: string } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { a?: unknown; r?: unknown };
    return typeof parsed.a === "string" && typeof parsed.r === "string" ? { a: parsed.a, r: parsed.r } : null;
  } catch {
    return null;
  }
}

/** For pages: who the stored session claims to be. Not verified; only used to choose what to show. */
export async function peekReviewerSession(): Promise<{ userId: string; aal: string | null; expiresAt: number | null } | null> {
  const tokens = await readTokens();
  const claims = peekJwt(tokens?.a);
  if (!claims?.sub) return null;
  return { userId: claims.sub, aal: claims.aal ?? null, expiresAt: claims.exp ?? null };
}

async function verifiedTotpFactor(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new ReviewerError(`Could not read your authenticator factors: ${error.message}`);
  const factor = data.totp.find((f) => f.status === "verified");
  if (!factor) throw new ReviewerError("Your account has no verified authenticator app. Set one up in Casevoya first (Settings › Security).");
  return factor.id;
}

async function stepUp(client: SupabaseClient, code: string): Promise<Session> {
  const factorId = await verifiedTotpFactor(client);
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new ReviewerError("That authenticator code was not accepted.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new ReviewerError("The step-up did not return a session.");
  return data.session;
}

/** Password + TOTP sign-in for the reviewer. The Supabase user must be the Access user. */
export async function signInReviewer(admin: AdminContext, password: string, code: string): Promise<void> {
  const client = userClient(admin);
  const { data, error } = await client.auth.signInWithPassword({ email: admin.email, password });
  if (error || !data.session) throw new ReviewerError("Email or password was not accepted.");
  if (data.user?.id !== admin.userId) {
    await client.auth.signOut({ scope: "local" });
    throw new ReviewerError("That Supabase user is not the user behind your Access sign-in.");
  }
  const session = await stepUp(client, code);
  await store(session);
}

/**
 * Restores the stored session (Supabase re-validates it, refreshing if needed), checks it belongs to the Access user,
 * does a fresh TOTP step-up, runs `fn` as the reviewer, then stores the refreshed tokens.
 */
export async function asReviewer<T>(admin: AdminContext, code: string, fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
  const tokens = await readTokens();
  if (!tokens) throw new ReviewerError("Sign in as the reviewer first.");
  const client = userClient(admin);
  const { data, error } = await client.auth.setSession({ access_token: tokens.a, refresh_token: tokens.r });
  if (error || !data.session || !data.user) {
    await clearReviewerSession();
    throw new ReviewerError("Your reviewer session has ended. Sign in again.");
  }
  if (data.user.id !== admin.userId) {
    await clearReviewerSession();
    throw new ReviewerError("The reviewer session belongs to a different user than your Access sign-in.");
  }
  const session = await stepUp(client, code);
  await store(session);
  return fn(client);
}

export async function signOutReviewer(admin: AdminContext): Promise<void> {
  const tokens = await readTokens();
  await clearReviewerSession();
  if (!tokens || !admin.env.supabasePublishableKey) return;
  const client = userClient(admin);
  const { error } = await client.auth.setSession({ access_token: tokens.a, refresh_token: tokens.r });
  if (!error) await client.auth.signOut({ scope: "local" });
}
