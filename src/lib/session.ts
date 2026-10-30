import "server-only";
import { cookies } from "next/headers";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminEnv } from "./env";
import { redact } from "./api/errors";
import { peekJwt } from "./templates";

/**
 * The admin's OWN Supabase session (password + authenticator code). Some database functions refuse the service
 * role and read auth.uid(), aal2 and a recent second factor themselves: template approve/reject/rollback, recording a
 * licence check, retrying a dead letter, and every admin-management function. The portal signs the admin in with
 * the publishable key and keeps the tokens in one httpOnly, Secure, SameSite=Strict, host-only cookie: idle for at
 * most an hour, and never longer than 12 hours after sign-in (checked on the server). The session must always be
 * the same auth user as the Cloudflare Access email.
 */
export const SESSION_COOKIE = "__Host-cv-admin-session";
const LEGACY_COOKIE = "__Host-cv-reviewer";
/** Sliding idle timeout: the cookie is re-set on use. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;
/** Absolute lifetime from password sign-in, whatever the activity. */
export const SESSION_ABSOLUTE_MAX_SECONDS = 12 * 60 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);
/** Matches app.mfa_step_up_satisfied() in the database (15 minutes). */
export const STEP_UP_WINDOW_SECONDS = 15 * 60;

export class SessionError extends Error {
  constructor(
    readonly kind: "unavailable" | "no_session" | "mismatch" | "bad_credentials" | "bad_code" | "no_factor" | "expired",
    message: string,
  ) {
    super(message);
  }
}

/** Whose session this is: the Access email and its auth user (admins, invitees, and the first-admin Setup). */
type Caller = { env: AdminEnv; email: string; userId: string };

export type SessionStatus = {
  signedIn: boolean;
  userId: string | null;
  aal: string | null;
  /** Unix seconds the stored access token expires (it is refreshed on use while the cookie lives). */
  expiresAt: number | null;
  /** Unix seconds of the latest second-factor verification in the token, if any. */
  stepUpAt: number | null;
  /** Unix seconds until which the database will accept the step-up (stepUpAt + 15 minutes). */
  stepUpFreshUntil: number | null;
  matchesAccessUser: boolean;
};

const SECOND_FACTORS = new Set(["totp", "passkey", "webauthn", "mfa/webauthn", "recovery_code", "mfa/recovery_code"]);

/** Reads the session facts from an access token (display and pre-checks only; the database re-checks). */
export function describeToken(token: string | null | undefined, accessUserId: string): SessionStatus {
  const claims = peekJwt(token) as (ReturnType<typeof peekJwt> & { amr?: { method?: string; timestamp?: number }[] }) | null;
  if (!claims?.sub) {
    return { signedIn: false, userId: null, aal: null, expiresAt: null, stepUpAt: null, stepUpFreshUntil: null, matchesAccessUser: false };
  }
  const stamps = (Array.isArray(claims.amr) ? claims.amr : [])
    .filter((entry) => entry && SECOND_FACTORS.has(String(entry.method)) && typeof entry.timestamp === "number")
    .map((entry) => entry.timestamp as number);
  const stepUpAt = stamps.length ? Math.max(...stamps) : null;
  return {
    signedIn: true,
    userId: claims.sub,
    aal: claims.aal ?? null,
    expiresAt: claims.exp ?? null,
    stepUpAt,
    stepUpFreshUntil: stepUpAt == null ? null : stepUpAt + STEP_UP_WINDOW_SECONDS,
    matchesAccessUser: claims.sub === accessUserId,
  };
}

/** Unix seconds of the latest password sign-in in the token's amr, if any. */
export function passwordSignInAt(token: string | null | undefined): number | null {
  const claims = peekJwt(token) as { amr?: { method?: string; timestamp?: number }[] } | null;
  const stamps = (Array.isArray(claims?.amr) ? claims.amr : [])
    .filter((entry) => entry && entry.method === "password" && typeof entry.timestamp === "number")
    .map((entry) => entry.timestamp as number);
  return stamps.length ? Math.max(...stamps) : null;
}

/**
 * Whether the session is past its absolute lifetime: the cookie's own end (set at sign-in; a cookie without one
 * is treated as ended) and, when a re-validated access token is given, its password sign-in time + 12 hours.
 */
export function absoluteExpired(cookieEndsAt: number | null | undefined, verifiedToken: string | null, now: number): boolean {
  if (typeof cookieEndsAt !== "number" || !Number.isFinite(cookieEndsAt) || now >= cookieEndsAt) return true;
  // An end further away than a full lifetime was not set by this portal.
  if (cookieEndsAt > now + SESSION_ABSOLUTE_MAX_SECONDS + 60) return true;
  const signedInAt = verifiedToken ? passwordSignInAt(verifiedToken) : null;
  return signedInAt != null && now >= signedInAt + SESSION_ABSOLUTE_MAX_SECONDS;
}

export function stepUpIsFresh(status: SessionStatus, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return status.signedIn && status.matchesAccessUser && status.aal === "aal2" && status.stepUpFreshUntil != null && status.stepUpFreshUntil > nowSeconds + 5;
}

function userClient(caller: Caller): SupabaseClient {
  const key = caller.env.supabasePublishableKey;
  if (!key) throw new SessionError("unavailable", "The Worker has no SUPABASE_PUBLISHABLE_KEY; admin sign-in is unavailable.");
  return createClient(caller.env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-casevoya-client": "casevoya-admin-session" } },
  });
}

/** Stores the tokens with the absolute end `endsAt` (unix seconds); the cookie never outlives it. */
async function store(session: Session, endsAt: number): Promise<void> {
  const maxAge = Math.max(0, Math.min(SESSION_MAX_AGE_SECONDS, endsAt - nowSeconds()));
  (await cookies()).set(SESSION_COOKIE, JSON.stringify({ a: session.access_token, r: session.refresh_token, x: endsAt }), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

/** A new sign-in starts a new absolute lifetime. */
const newSessionEnd = () => nowSeconds() + SESSION_ABSOLUTE_MAX_SECONDS;

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  if (jar.get(LEGACY_COOKIE)) jar.set(LEGACY_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
}

/** The stored tokens and absolute end (null when the cookie has none), ignoring expiry. */
async function readStoredTokens(): Promise<{ a: string; r: string; x: number | null } | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { a?: unknown; r?: unknown; x?: unknown };
    if (typeof parsed.a !== "string" || typeof parsed.r !== "string") return null;
    return { a: parsed.a, r: parsed.r, x: typeof parsed.x === "number" ? parsed.x : null };
  } catch {
    return null;
  }
}

/** The stored tokens, or null when there are none or the session is past its absolute lifetime. */
async function readTokens(): Promise<{ a: string; r: string; x: number } | null> {
  const tokens = await readStoredTokens();
  if (!tokens || tokens.x === null || absoluteExpired(tokens.x, null, nowSeconds())) return null;
  return { a: tokens.a, r: tokens.r, x: tokens.x };
}

/** What the stored cookie claims (not re-validated with Supabase; used to decide what to show and to pre-check). */
export async function sessionStatus(caller: Caller): Promise<SessionStatus> {
  const tokens = await readTokens();
  return describeToken(tokens?.a, caller.userId);
}

async function verifiedTotpFactor(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) {
    console.error("admin session: factor list failed", { error: redact(error.message) });
    throw new SessionError("unavailable", "Could not read your authenticator factors.");
  }
  const factor = data.totp.find((f) => f.status === "verified");
  if (!factor) throw new SessionError("no_factor", "Your account has no verified authenticator app. Set one up in Casevoya first (Settings › Security).");
  return factor.id;
}

async function verifyCode(client: SupabaseClient, code: string): Promise<Session> {
  const factorId = await verifiedTotpFactor(client);
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new SessionError("bad_code", "That authenticator code was not accepted.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new SessionError("unavailable", "The step-up did not return a session.");
  return data.session;
}

/** Password + TOTP sign-in. The Supabase user must be the Access user. */
export async function signIn(caller: Caller, password: string, code: string): Promise<SessionStatus> {
  const client = userClient(caller);
  const { data, error } = await client.auth.signInWithPassword({ email: caller.email, password });
  if (error || !data.session) throw new SessionError("bad_credentials", "Email or password was not accepted.");
  if (data.user?.id !== caller.userId) {
    await client.auth.signOut({ scope: "local" });
    throw new SessionError("mismatch", "That Supabase user is not the user behind your Access sign-in.");
  }
  const session = await verifyCode(client, code);
  await store(session, newSessionEnd());
  return describeToken(session.access_token, caller.userId);
}

/**
 * Restores the stored session (Supabase re-validates and refreshes it), checks it is the Access user and that it
 * is within its absolute lifetime (cookie end and the verified token's password sign-in time).
 */
async function restore(caller: Caller): Promise<{ client: SupabaseClient; session: Session; endsAt: number }> {
  const tokens = await readTokens();
  if (!tokens) {
    await clearSession();
    throw new SessionError("no_session", "Sign in with your password and authenticator code first.");
  }
  const client = userClient(caller);
  const { data, error } = await client.auth.setSession({ access_token: tokens.a, refresh_token: tokens.r });
  if (error || !data.session || !data.user) {
    await clearSession();
    throw new SessionError("expired", "Your admin session has ended. Sign in again.");
  }
  if (data.user.id !== caller.userId) {
    await clearSession();
    throw new SessionError("mismatch", "The admin session belongs to a different user than your Access sign-in.");
  }
  if (absoluteExpired(tokens.x, data.session.access_token, nowSeconds())) {
    await client.auth.signOut({ scope: "local" });
    await clearSession();
    throw new SessionError("expired", "Your admin session has ended (12 hours after sign-in). Sign in again.");
  }
  return { client, session: data.session, endsAt: tokens.x };
}

/** A fresh TOTP step-up on the stored session (valid for the database for 15 minutes). */
export async function stepUp(caller: Caller, code: string): Promise<SessionStatus> {
  const { client, endsAt } = await restore(caller);
  const session = await verifyCode(client, code);
  await store(session, endsAt);
  return describeToken(session.access_token, caller.userId);
}

/**
 * A Supabase client acting as the admin. With `code`, steps up first. Without it, the stored session's own
 * step-up must still be fresh (the database re-checks either way).
 */
export async function userSessionClient(caller: Caller, code?: string | null): Promise<{ client: SupabaseClient; status: SessionStatus }> {
  const { client, session, endsAt } = await restore(caller);
  let current = session;
  if (code) current = await verifyCode(client, code);
  await store(current, endsAt);
  return { client, status: describeToken(current.access_token, caller.userId) };
}

export async function signOut(caller: Caller): Promise<void> {
  // Also revokes a session past its absolute lifetime.
  const tokens = await readStoredTokens();
  await clearSession();
  if (!tokens || !caller.env.supabasePublishableKey) return;
  const client = userClient(caller);
  const { error } = await client.auth.setSession({ access_token: tokens.a, refresh_token: tokens.r });
  if (!error) await client.auth.signOut({ scope: "local" });
}

// ------------------------------------------------------------------ first-admin Setup (src/lib/api/modules/setup.ts)

/**
 * Setup step 1: password-only sign-in for the Access user. Stores the same session cookie as signIn (aal1 until
 * the authenticator is verified). Throws bad_credentials when the password is not accepted.
 */
export async function signInWithPasswordOnly(caller: Caller, password: string): Promise<SessionStatus> {
  const client = userClient(caller);
  const { data, error } = await client.auth.signInWithPassword({ email: caller.email, password });
  if (error || !data.session) throw new SessionError("bad_credentials", "That password was not accepted.");
  if (data.user?.id !== caller.userId) {
    await client.auth.signOut({ scope: "local" });
    throw new SessionError("mismatch", "That Supabase user is not the user behind your Access sign-in.");
  }
  await store(data.session, newSessionEnd());
  return describeToken(data.session.access_token, caller.userId);
}

/** The stored session for the Access user, re-validated with Supabase, or null when there is none or it ended. */
export async function setupSessionStatus(caller: Caller): Promise<SessionStatus | null> {
  if (!(await readTokens())) return null;
  try {
    const { session, endsAt } = await restore(caller);
    await store(session, endsAt);
    return describeToken(session.access_token, caller.userId);
  } catch (error) {
    if (error instanceof SessionError && error.kind !== "unavailable") return null;
    throw error;
  }
}

export type TotpEnrolment = { factorId: string; qrCode: string; secret: string; uri: string };

/** Setup step 2: enrols a new TOTP factor on the user's own session. The secret goes to the browser only. */
export async function enrolTotp(caller: Caller): Promise<TotpEnrolment> {
  const { client } = await restore(caller);
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Casevoya admin", issuer: "Casevoya admin" });
  if (error || !data || data.type !== "totp") {
    if (error) console.error("admin session: authenticator enrolment failed", { error: redact(error.message) });
    throw new SessionError("unavailable", "Could not start the authenticator setup.");
  }
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Setup step 2: verifies a code for a factor (first verification of a new factor, or an existing one) and stores the aal2 session. */
export async function verifyTotp(caller: Caller, factorId: string, code: string): Promise<SessionStatus> {
  const { client, endsAt } = await restore(caller);
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new SessionError("bad_code", "That authenticator code was not accepted.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new SessionError("unavailable", "The authenticator check did not return a session.");
  await store(data.session, endsAt);
  return describeToken(data.session.access_token, caller.userId);
}
