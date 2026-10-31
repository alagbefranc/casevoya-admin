import { z } from "zod";
import type { AdminEnv } from "../../env";
import type { SetupContext } from "../../guard";
import type { SessionStatus, TotpEnrolment } from "../../session";
import { defineEndpoint, type HandlerCtx } from "../core";
import { ApiError, fromDbError, redact, type DbError } from "../errors";
import { code, empty } from "../schemas";

/**
 * First-admin Setup (docs/BOOTSTRAP.md). While public.platform_admins is empty, the Access user on the allow list
 * creates or confirms their Casevoya account, enrols an authenticator and becomes the owner through the
 * service-role function bootstrap_first_platform_admin. Every request passes the setup gate (Access JWT + allow
 * list + empty table, src/lib/guard.ts) on the server; once any admin exists every endpoint answers 409.
 * Passwords, codes and TOTP secrets are never logged or audited.
 */

export const SETUP_PASSWORD_MIN = 12;
export const SETUP_NOTE = "first admin via admin portal Setup";
/**
 * Bad passwords plus bad codes allowed per Access email in the window, counted from the audit log. Once the auth
 * user exists, password and code requests are also reserved atomically per user id first (core.ts step 5a).
 */
export const SETUP_MAX_BAD_ATTEMPTS = 5;
export const SETUP_LOCKOUT_MINUTES = 15;
export const SETUP_RESET_REFUSED_MESSAGE =
  "This account already has a verified authenticator, so Setup cannot replace its password. Continue with your current password, or reset it with Casevoya's password reset email first.";
export const SETUP_ALREADY_DONE_MESSAGE = "The database refused to make you the first admin: a platform admin already exists. Reload the page.";

export type SetupFactor = { id: string; type: string; status: string; createdAt: string };
export type SetupUser = { id: string; emailConfirmed: boolean; fullName: string | null; factors: SetupFactor[] };
/** The Access user once their auth user is known: what the session helpers need. */
export type SetupTarget = { env: AdminEnv; email: string; userId: string };

/** Supabase operations Setup needs (src/lib/setup.ts). Injected so tests need no network or cookies. */
export type SetupApi = {
  getUser(caller: SetupContext, userId: string): Promise<SetupUser | null>;
  /** Creates the auth user for the Access email with the email already confirmed. */
  createUser(caller: SetupContext, input: { password: string; fullName: string }): Promise<SetupUser>;
  updateUser(caller: SetupContext, userId: string, patch: { password?: string; fullName?: string; confirmEmail?: boolean }): Promise<void>;
  /** Password sign-in; stores the portal session cookie. Throws a SessionError (bad_credentials) when refused. */
  signIn(target: SetupTarget, password: string): Promise<SessionStatus>;
  /** The stored portal session for this user, re-validated, or null. */
  session(target: SetupTarget): Promise<SessionStatus | null>;
  enrol(target: SetupTarget): Promise<TotpEnrolment>;
  /** Removes an UNVERIFIED factor (service role). */
  deleteFactor(caller: SetupContext, userId: string, factorId: string): Promise<void>;
  /** Removes EVERY factor (verified or not, any type) of the user (service role). Returns how many were removed. */
  deleteAllFactors(caller: SetupContext, userId: string): Promise<number>;
  /** Verifies a code for the factor; stores the aal2 session. Throws a SessionError (bad_code) when refused. */
  verify(target: SetupTarget, factorId: string, code: string): Promise<SessionStatus>;
  /** Bad setup passwords and codes for this email recorded in the audit log since `sinceIso`. */
  recentBadAttempts(caller: SetupContext, sinceIso: string): Promise<number>;
  /** Joining: accept_platform_admin_invite with the user's OWN aal2 session (the function reads auth.uid()). */
  acceptInvite(target: SetupTarget): Promise<{ ok: true; result: { user_id: string; role: string; template_reviewer: boolean } } | { ok: false; error: DbError }>;
};

const fullName = z.string().trim().min(2, "Enter your full name").max(120, "Use at most 120 characters for your name");
const password = z
  .string()
  .min(SETUP_PASSWORD_MIN, `Use at least ${SETUP_PASSWORD_MIN} characters`)
  .max(200, "Use at most 200 characters");


export function api(ctx: HandlerCtx<unknown>): SetupApi {
  if (!ctx.deps.setup) throw new ApiError("internal", "Setup is not available on this deployment");
  return ctx.deps.setup;
}

export function setupCaller(ctx: HandlerCtx<unknown>): SetupContext {
  if (!ctx.setupCaller) throw new ApiError("forbidden", "Setup is only for the first admin");
  return ctx.setupCaller;
}

const totp = (factors: SetupFactor[]) => factors.filter((f) => f.type === "totp");
export const verifiedTotp = (user: SetupUser) => totp(user.factors).filter((f) => f.status === "verified");
export const pendingTotp = (user: SetupUser) =>
  totp(user.factors)
    .filter((f) => f.status !== "verified")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function target(caller: SetupContext, userId: string): SetupTarget {
  return { env: caller.env, email: caller.email, userId };
}

/**
 * Refuses while too many bad passwords or codes were recorded for this email in the lockout window. Fails closed:
 * when the count cannot be read the request is refused.
 */
export async function checkLockout(ctx: HandlerCtx<unknown>, caller: SetupContext): Promise<void> {
  const now = (ctx.deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000)) * 1000;
  const since = new Date(now - SETUP_LOCKOUT_MINUTES * 60_000).toISOString();
  const setup = api(ctx);
  let bad: number;
  try {
    bad = await setup.recentBadAttempts(caller, since);
  } catch (error) {
    ctx.log("admin setup attempt count failed", { requestId: ctx.requestId, error: redact(error instanceof Error ? error.message : String(error)) });
    throw new ApiError("upstream_error", "Could not check recent setup attempts, so nothing was tried. Try again.");
  }
  if (!Number.isFinite(bad) || bad < 0) throw new ApiError("upstream_error", "Could not check recent setup attempts, so nothing was tried. Try again.");
  if (bad >= SETUP_MAX_BAD_ATTEMPTS) {
    ctx.log("admin setup locked out after bad attempts", { requestId: ctx.requestId, attempts: bad });
    throw new ApiError("rate_limited", `Too many wrong passwords or codes. Wait ${SETUP_LOCKOUT_MINUTES} minutes, then try again.`, {
      retryAfterMinutes: SETUP_LOCKOUT_MINUTES,
    });
  }
}

/** Marks the audit entry as a bad attempt (it is what the lockout counts). Never includes the value. */
function markBad(ctx: HandlerCtx<unknown>, caller: SetupContext, kind: "password" | "code") {
  ctx.audit.context = { ...(ctx.audit.context ?? {}), setup_email: caller.email, setup_bad_attempt: kind };
}

function isKind(error: unknown, kind: string): boolean {
  return Boolean(error && typeof error === "object" && "kind" in error && (error as { kind: string }).kind === kind);
}

/** The auth user plus a signed-in portal session for them (steps 2 and 3). */
export async function requireSetupSession(ctx: HandlerCtx<unknown>, caller: SetupContext): Promise<{ user: SetupUser; status: SessionStatus }> {
  const user = caller.userId ? await api(ctx).getUser(caller, caller.userId) : null;
  if (!user) throw new ApiError("session_required", "Create your account first (step 1)");
  const status = await api(ctx).session(target(caller, user.id));
  if (!status?.signedIn || !status.matchesAccessUser) throw new ApiError("session_required", "Sign in with your password first (step 1)");
  ctx.audit.actorId = user.id;
  ctx.audit.objectId = user.id;
  return { user, status };
}

/**
 * Account, authenticator and verify steps, shared by first-admin Setup (/setup/*) and invited admins joining
 * (/join/*). For "join" an existing account must already be confirmed: there is no password takeover there.
 */
export function accountSteps(flow: "setup" | "join") {
  const base = `/${flow}`;
  const label = flow === "setup" ? "Setup" : "Join";
  return [
    defineEndpoint({
      method: "POST",
      path: `${base}/account`,
      summary: `${label} step 1: confirm your existing Casevoya password, or create the account (email confirmed), save your name, sign in.`,
      roles: [],
      gate: flow,
      input: z.object({ fullName, password }),
      audit: { action: `${flow}.account`, table: "auth.users" },
      async handler(rawCtx) {
        const ctx = rawCtx;
        const caller = setupCaller(ctx);
        ctx.audit.actorId = caller.userId;
        ctx.audit.objectId = caller.userId;
        ctx.audit.context = { setup_email: caller.email };
        await checkLockout(ctx, caller);
        const setup = api(ctx);
        let user = caller.userId ? await setup.getUser(caller, caller.userId) : null;
        let created = false;
        if (user) {
          // An unconfirmed account never proved ownership of this mailbox: neither confirm it nor accept its
          // existing password. The new-password path (/setup/password) takes it over instead.
          if (!user.emailConfirmed) {
            ctx.log("admin setup existing account is unconfirmed; new password required", { requestId: ctx.requestId, userId: user.id });
            if (flow === "join") {
              throw new ApiError("conflict", "This Casevoya account's email was never confirmed. Ask an owner to help, or confirm it from the Casevoya sign-up email, then try again.");
            }
            throw new ApiError("validation_failed", "This account's email was never confirmed. Set a new password to continue.", {
              issues: [{ path: "password", message: "This account's email was never confirmed. Set a new password to continue." }],
              canReset: true,
              unconfirmed: true,
            });
          }
          try {
            await setup.signIn(target(caller, user.id), ctx.input.password);
          } catch (error) {
            if (!isKind(error, "bad_credentials")) throw error;
            markBad(ctx, caller, "password");
            ctx.log("admin setup password not accepted", { requestId: ctx.requestId, userId: user.id });
            // Only Setup offers a new password, and never for an account that already has a verified authenticator.
            throw new ApiError("validation_failed", "That password was not accepted for this account", {
              issues: [{ path: "password", message: "That password was not accepted for this account" }],
              canReset: flow === "setup" && verifiedTotp(user).length === 0,
            });
          }
          await setup.updateUser(caller, user.id, { fullName: ctx.input.fullName });
        } else {
          try {
            user = await setup.createUser(caller, { password: ctx.input.password, fullName: ctx.input.fullName });
          } catch (error) {
            if (error instanceof ApiError) throw error;
            // Supabase Auth's message stays in the server log; the browser gets a generic one.
            ctx.log("admin setup account creation refused", { requestId: ctx.requestId, error: redact(error instanceof Error ? error.message : String(error)) });
            const message = "The account could not be created. Check that the password meets Casevoya's password rules, then try again.";
            throw new ApiError("validation_failed", message, { issues: [{ path: "password", message }] });
          }
          created = true;
          await setup.signIn(target(caller, user.id), ctx.input.password);
        }
        ctx.audit.actorId = user.id;
        ctx.audit.objectId = user.id;
        ctx.audit.context = { setup_email: caller.email, created };
        ctx.log("admin setup account ready", { requestId: ctx.requestId, userId: user.id, created });
        return { step: "authenticator", created, userId: user.id };
      },
    }),
    defineEndpoint({
      method: "POST",
      path: `${base}/authenticator`,
      summary: `${label} step 2: start the authenticator. Reuses a pending one unless restart is true (then removes unverified factors and enrols anew).`,
      roles: [],
      gate: flow,
      input: z.object({ restart: z.boolean().default(false) }),
      audit: { action: `${flow}.authenticator_started`, table: "auth.mfa_factors" },
      async handler(rawCtx) {
        const ctx = rawCtx;
        const caller = setupCaller(ctx);
        const setup = api(ctx);
        const { user } = await requireSetupSession(ctx, caller);
        if (verifiedTotp(user).length) return { mode: "existing" };
        const pending = pendingTotp(user);
        if (pending.length && !ctx.input.restart) return { mode: "pending" };
        for (const factor of pending) await setup.deleteFactor(caller, user.id, factor.id);
        const enrolment = await setup.enrol(target(caller, user.id));
        ctx.audit.context = { removed_pending: pending.length };
        ctx.log("admin setup authenticator enrolment started", { requestId: ctx.requestId, userId: user.id, removedPending: pending.length });
        return { mode: "new", factorId: enrolment.factorId, qrCode: enrolment.qrCode, secret: enrolment.secret, uri: enrolment.uri };
      },
    }),
    defineEndpoint({
      method: "POST",
      path: `${base}/authenticator/verify`,
      summary: `${label} step 2: verify the 6-digit code (first code of the new factor, or of an existing one). Your session becomes aal2.`,
      roles: [],
      gate: flow,
      input: z.object({ code }),
      audit: { action: `${flow}.authenticator_verified`, table: "auth.mfa_factors" },
      async handler(rawCtx) {
        const ctx = rawCtx;
        const caller = setupCaller(ctx);
        const setup = api(ctx);
        const { user } = await requireSetupSession(ctx, caller);
        await checkLockout(ctx, caller);
        const factor = verifiedTotp(user)[0] ?? pendingTotp(user)[0];
        if (!factor) throw new ApiError("conflict", "Start the authenticator setup first");
        try {
          await setup.verify(target(caller, user.id), factor.id, ctx.input.code);
        } catch (error) {
          if (!isKind(error, "bad_code")) throw error;
          markBad(ctx, caller, "code");
          ctx.log("admin setup authenticator code not accepted", { requestId: ctx.requestId, userId: user.id });
          throw new ApiError("validation_failed", "That code was not accepted. Check the time on your phone and try the next code.", {
            issues: [{ path: "code", message: "That code was not accepted" }],
          });
        }
        ctx.audit.context = { factor_was_new: factor.status !== "verified" };
        ctx.log("admin setup authenticator verified", { requestId: ctx.requestId, userId: user.id });
        return { step: "finish" };
      },
    }),
  ];
}

export const setupEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/setup",
    summary: "First-admin Setup state: open (which step you are on) while platform_admins is empty; 409 once locked.",
    roles: [],
    gate: "setup",
    input: empty,
    async handler(ctx) {
      const caller = setupCaller(ctx);
      const user = caller.userId ? await api(ctx).getUser(caller, caller.userId) : null;
      const status = user ? await api(ctx).session(target(caller, user.id)) : null;
      const signedIn = Boolean(status?.signedIn && status.matchesAccessUser);
      const verified = user ? verifiedTotp(user).length > 0 : false;
      const pending = user ? pendingTotp(user).length > 0 : false;
      const step = !user || !signedIn ? "account" : status?.aal === "aal2" && verified ? "finish" : "authenticator";
      return {
        state: "open",
        email: caller.email,
        step,
        account: { exists: Boolean(user), fullName: user?.fullName ?? null },
        authenticator: { verified, pending },
        passwordMinLength: SETUP_PASSWORD_MIN,
        signInAvailable: Boolean(caller.env.supabasePublishableKey),
      };
    },
  }),
  ...accountSteps("setup"),
  defineEndpoint({
    method: "POST",
    path: "/setup/password",
    summary:
      "Setup step 1, other path: set a new password on the existing account (only while platform_admins is empty), then sign in. Refused (409) for a confirmed account with a verified authenticator.",
    roles: [],
    gate: "setup",
    input: z.object({ fullName, password, confirm: z.literal(true, { message: "Confirm you want to set a new password" }) }),
    audit: { action: "setup.password_reset", table: "auth.users" },
    async handler(rawCtx) {
      const ctx = rawCtx;
      const caller = setupCaller(ctx);
      ctx.audit.actorId = caller.userId;
      ctx.audit.objectId = caller.userId;
      ctx.audit.context = { setup_email: caller.email };
      await checkLockout(ctx, caller);
      const setup = api(ctx);
      const user = caller.userId ? await setup.getUser(caller, caller.userId) : null;
      if (!user) throw new ApiError("conflict", "There is no account for this email yet. Create it instead.");
      // A confirmed account with a verified authenticator keeps its password: Setup has no way to check that
      // authenticator without the current password, so it refuses rather than bypass it.
      if (user.emailConfirmed && verifiedTotp(user).length) {
        ctx.audit.context = { setup_email: caller.email, refused: "verified_factor" };
        ctx.log("admin setup password reset refused: account has a verified authenticator", { requestId: ctx.requestId, userId: user.id });
        throw new ApiError("conflict", SETUP_RESET_REFUSED_MESSAGE, { canReset: false, verifiedFactor: true });
      }
      // An unconfirmed account may have been registered by someone else: remove every factor on it before
      // confirming the email and setting the new password.
      let removedFactors = 0;
      if (!user.emailConfirmed) {
        removedFactors = await setup.deleteAllFactors(caller, user.id);
        ctx.audit.context = { setup_email: caller.email, was_unconfirmed: true, removed_factors: removedFactors };
      }
      await setup.updateUser(caller, user.id, { password: ctx.input.password, fullName: ctx.input.fullName, confirmEmail: !user.emailConfirmed || undefined });
      await setup.signIn(target(caller, user.id), ctx.input.password);
      ctx.log("admin setup password replaced", { requestId: ctx.requestId, userId: user.id, removedFactors });
      return { step: "authenticator", userId: user.id };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/setup/finish",
    summary: "Setup step 3: become the owner via bootstrap_first_platform_admin (service role). Locks Setup for good.",
    roles: [],
    gate: "setup",
    input: z.object({ confirm: z.literal(true, { message: "Confirm you want to become the owner" }) }),
    audit: { action: "setup.finished", table: "public.platform_admins" },
    async handler(rawCtx) {
      const caller = setupCaller(rawCtx);
      const { user, status } = await requireSetupSession(rawCtx, caller);
      if (!verifiedTotp(user).length) throw new ApiError("conflict", "Verify your authenticator app first (step 2)");
      if (status.aal !== "aal2") throw new ApiError("step_up_required", "Enter a code from your authenticator app first (step 2)");
      const { error } = await caller.db.rpc("bootstrap_first_platform_admin", { p_user_id: user.id, p_note: SETUP_NOTE });
      if (error) {
        const dbError = error as DbError;
        // The database refuses once any platform admin exists (42501 today, 55000 in newer migrations).
        if (dbError.code === "42501" || dbError.code === "55000") {
          const out = new ApiError("conflict", SETUP_ALREADY_DONE_MESSAGE, { locked: true, lockedAt: null });
          out.internal = `${dbError.code}: ${dbError.message}`;
          throw out;
        }
        throw fromDbError(dbError);
      }
      rawCtx.log("admin setup finished: first platform admin created", { requestId: rawCtx.requestId, userId: user.id });
      return { done: true, userId: user.id, role: "owner" };
    },
  }),
];
