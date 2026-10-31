import { z } from "zod";
import type { JoinContext } from "../../guard";
import { defineEndpoint, type HandlerCtx } from "../core";
import { ApiError, fromDbError } from "../errors";
import { empty } from "../schemas";
import { accountSteps, api, requireSetupSession, setupCaller, SETUP_PASSWORD_MIN, target, verifiedTotp, pendingTotp } from "./setup";

/**
 * Joining as an invited admin (docs/ACCESS.md). An owner's invite adds the email to Cloudflare Access and emails an
 * accept link to /join. There the invited person, who may have no Casevoya account yet, creates it (or signs in to
 * their confirmed account), enrols an authenticator and accepts with their own aal2 session through
 * accept_platform_admin_invite. Every request passes the join gate (Access JWT + an open invite for that email).
 */

function joinCaller(ctx: HandlerCtx<unknown>): JoinContext {
  const caller = setupCaller(ctx) as JoinContext;
  if (!("join" in caller) || !caller.join) throw new ApiError("forbidden", "Joining needs an open invite");
  return caller;
}

export const joinEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/join",
    summary: "Join state for someone with an open invite: the invite and which step they are on.",
    roles: [],
    gate: "join",
    input: empty,
    async handler(ctx) {
      const caller = joinCaller(ctx);
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
        invite: { role: caller.join.role, templateReviewer: caller.join.templateReviewer, expiresAt: caller.join.expiresAt },
        account: { exists: Boolean(user), fullName: user?.fullName ?? null, confirmed: user?.emailConfirmed ?? null },
        authenticator: { verified, pending },
        passwordMinLength: SETUP_PASSWORD_MIN,
        signInAvailable: Boolean(caller.env.supabasePublishableKey),
      };
    },
  }),
  ...accountSteps("join"),
  defineEndpoint({
    method: "POST",
    path: "/join/finish",
    summary: "Join step 3: accept the invite with your own aal2 session (accept_platform_admin_invite).",
    roles: [],
    gate: "join",
    input: z.object({ confirm: z.literal(true, { message: "Confirm you accept the invite" }) }),
    audit: { action: "join.finished", table: "public.platform_admins" },
    async handler(ctx) {
      const caller = joinCaller(ctx);
      const { user, status } = await requireSetupSession(ctx, caller);
      if (!verifiedTotp(user).length) throw new ApiError("conflict", "Verify your authenticator app first (step 2)");
      if (status.aal !== "aal2") throw new ApiError("step_up_required", "Enter a code from your authenticator app first (step 2)");
      ctx.audit.context = { invite_id: caller.join.id, role: caller.join.role };
      const out = await api(ctx).acceptInvite(target(caller, user.id));
      if (!out.ok) throw fromDbError(out.error);
      ctx.log("admin invite accepted via join", { requestId: ctx.requestId, userId: user.id, role: out.result.role });
      return { done: true, userId: user.id, role: out.result.role, templateReviewer: out.result.template_reviewer };
    },
  }),
];
