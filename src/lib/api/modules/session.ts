import { z } from "zod";
import type { InviteeContext } from "../../guard";
import { ALL_ROLES, defineEndpoint, rpc, type Caller } from "../core";
import { ApiError } from "../errors";
import { code, empty } from "../schemas";

type AdminListRow = { user_id: string; licensed: boolean; verified_factors: number };

function capabilities(caller: Caller, licensed: boolean, signInAvailable: boolean) {
  const role = caller.role;
  return {
    read: role !== null,
    operate: role === "owner" || role === "operator",
    manageAdmins: role === "owner",
    reviewTemplates: role !== null && role !== "viewer" && caller.templateReviewer && licensed,
    acceptInvite: role === null,
    signInAvailable,
  };
}

export const sessionEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/session",
    summary: "Who you are: Access email, platform role, reviewer flag, licence, own-session and step-up state, open invite.",
    roles: ALL_ROLES,
    gate: "invitee",
    input: empty,
    async handler({ caller, deps }) {
      const session = await deps.sessions.status(caller);
      let licensed = false;
      let verifiedFactors: number | null = null;
      if (caller.role !== null) {
        const list = await rpc<{ admins: AdminListRow[] }>(caller.db, "platform_admin_list");
        const me = list.admins.find((a) => a.user_id === caller.userId);
        licensed = Boolean(me?.licensed);
        verifiedFactors = me?.verified_factors ?? null;
      }
      return {
        email: caller.email,
        userId: caller.userId,
        role: caller.role,
        templateReviewer: caller.templateReviewer,
        licensed,
        verifiedFactors,
        invite: caller.role === null ? (caller as InviteeContext).invite : null,
        session,
        capabilities: capabilities(caller, licensed, Boolean(caller.env.supabasePublishableKey)),
        environment: { supabaseUrl: caller.env.supabaseUrl, adminOrigin: caller.env.adminOrigin },
      };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/session/sign-in",
    summary: "Sign in as yourself (Casevoya password + authenticator code). Must be the Access user.",
    roles: ALL_ROLES,
    gate: "invitee",
    input: z.object({ password: z.string().min(1, "Enter your password").max(200), code }),
    audit: { action: "session.sign_in", table: "auth.users" },
    async handler({ caller, deps, input, audit }) {
      audit.objectId = caller.userId;
      return { session: await deps.sessions.signIn(caller, input.password, input.code) };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/session/step-up",
    summary: "Fresh authenticator code on your own session (accepted by the database for 15 minutes).",
    roles: ALL_ROLES,
    gate: "invitee",
    input: z.object({ code }),
    session: "required",
    audit: { action: "session.step_up", table: "auth.users" },
    async handler({ caller, deps, input, audit }) {
      audit.objectId = caller.userId;
      return { session: await deps.sessions.stepUp(caller, input.code) };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/session/sign-out",
    summary: "End your own session (the Access sign-in is separate).",
    roles: ALL_ROLES,
    gate: "invitee",
    input: empty,
    audit: { action: "session.sign_out", table: "auth.users" },
    async handler({ caller, deps, audit }) {
      audit.objectId = caller.userId;
      await deps.sessions.signOut(caller);
      return { signedOut: true };
    },
  }),
  defineEndpoint({
    method: "GET",
    path: "/session/invite",
    summary: "The open invite for your Access email, if any.",
    roles: ALL_ROLES,
    gate: "invitee",
    input: empty,
    async handler({ caller }) {
      if (caller.role !== null) return { invite: null, alreadyAdmin: true };
      return { invite: caller.invite, alreadyAdmin: false };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/session/accept-invite",
    summary: "Accept your invite. Needs your own session at aal2 (signed in with your code).",
    roles: ALL_ROLES,
    gate: "invitee",
    input: z.object({ confirm: z.literal(true, { message: "Confirm you accept the platform admin role" }) }),
    session: "required",
    auditRequired: true,
    audit: { action: "admins.invite_accepted", table: "public.platform_admin_invites" },
    async handler({ caller, userClient, audit }) {
      if (caller.role !== null) throw new ApiError("conflict", "You are already a platform admin");
      audit.objectId = caller.invite.id;
      const client = await userClient();
      return rpc(client, "accept_platform_admin_invite");
    },
  }),
];
