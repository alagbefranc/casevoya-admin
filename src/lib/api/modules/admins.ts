import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNERS, defineEndpoint, rpc, type HandlerCtx } from "../core";
import type { PolicyChange } from "../../access-policy";
import { ApiError } from "../errors";
import { boolish, optionalCode, reason, uuid } from "../schemas";

const ROLE = z.enum(["owner", "operator", "viewer"]);

/** The template reviewer flag is only for owners and operators (the database enforces the same rule). */
export const VIEWER_REVIEWER_MESSAGE = "A viewer cannot be a template reviewer. Make them an operator or owner first.";

type AdminListRow = { user_id: string; email: string; role: string; template_reviewer: boolean };

async function adminRow(db: SupabaseClient, userId: string): Promise<AdminListRow | null> {
  const list = await rpc<{ admins: AdminListRow[] } | null>(db, "platform_admin_list");
  return list?.admins.find((a) => a.user_id === userId) ?? null;
}

/** The join link in the invite email. */
export const joinUrl = (origin: string) => `${origin}/join`;

function invites(ctx: HandlerCtx<unknown>) {
  if (!ctx.deps.invites || !ctx.caller.env.invites) {
    throw new ApiError("internal", "Inviting is not configured on this deployment (Cloudflare account, Access app and policy, and token).");
  }
  return ctx.deps.invites;
}

/** Re-syncs Access after a cancel or removal. Never fails the request: the database change already happened. */
async function resyncAfter(ctx: HandlerCtx<unknown>): Promise<{ accessUpdated: boolean; accessError: string | null; access: PolicyChange | null }> {
  try {
    const change = await invites(ctx).syncAccess(ctx.caller.env, ctx.db);
    ctx.audit.context = { ...(ctx.audit.context ?? {}), access_removed: change.removed.length, access_added: change.added.length };
    return { accessUpdated: true, accessError: null, access: change };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.log("admin access policy sync failed", { requestId: ctx.requestId, error: message, alert: "access_sync" });
    ctx.audit.context = { ...(ctx.audit.context ?? {}), access_sync_failed: true };
    return { accessUpdated: false, accessError: "Cloudflare Access could not be updated. Remove the email from the Access policy in Cloudflare.", access: null };
  }
}

export const adminEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/admins",
    summary: "Platform admins, invites and removals. Owners only.",
    roles: OWNERS,
    input: z.object({}).passthrough().transform(() => ({})),
    handler: ({ db }) => rpc(db, "platform_admin_list"),
  }),
  defineEndpoint({
    method: "POST",
    path: "/admins/invites",
    summary: "Invite someone by email (1 to 30 days): adds them to Cloudflare Access and emails them a link to /join.",
    roles: OWNERS,
    input: z
      .object({
        email: z.string().trim().toLowerCase().email("Enter a valid email").max(320),
        role: ROLE,
        templateReviewer: z.boolean().default(false),
        note: z.string().trim().max(200, "The note is at most 200 characters").optional().nullable(),
        days: z.number().int().min(1, "An invite lasts 1 to 30 days").max(30, "An invite lasts 1 to 30 days").default(7),
        code: optionalCode,
      })
      .superRefine((v, ctx) => {
        if (v.role === "viewer" && v.templateReviewer) ctx.addIssue({ code: "custom", path: ["templateReviewer"], message: VIEWER_REVIEWER_MESSAGE });
      }),
    session: "step_up",
    auditRequired: true,
    status: 201,
    audit: { action: "admins.invited", table: "public.platform_admin_invites" },
    async handler(ctx) {
      const { input, audit, userClient, caller, db } = ctx;
      const ops = invites(ctx);
      const client = await userClient();
      const id = await rpc<string>(client, "platform_admin_invite", {
        p_email: input.email,
        p_role: input.role,
        p_template_reviewer: input.templateReviewer,
        p_note: input.note || null,
        p_days: input.days,
      });
      audit.objectId = id;
      audit.context = { role: input.role, template_reviewer: input.templateReviewer, email_domain: input.email.split("@")[1], days: input.days };
      // 1. Let them through Cloudflare Access. If that fails, take the invite back so nothing is half-done.
      try {
        await ops.syncAccess(caller.env, db);
      } catch (error) {
        ctx.log("admin invite: access policy sync failed; cancelling the invite", { requestId: ctx.requestId, error: error instanceof Error ? error.message : String(error), alert: "access_sync" });
        await rpc(client, "platform_admin_cancel_invite", { p_invite_id: id, p_reason: "Cloudflare Access could not be updated" }).catch(() => undefined);
        const out = new ApiError("internal", "Cloudflare Access could not be updated, so the invite was cancelled. Try again in a minute.");
        throw out;
      }
      // 2. Email them the link. If the email fails the invite stays; the owner can send the link themselves.
      const acceptUrl = joinUrl(caller.env.adminOrigin);
      const expiresAt = new Date((ctx.deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000)) * 1000 + input.days * 86_400_000).toISOString();
      const mail = await ops.sendMail(caller.env, {
        to: input.email,
        role: input.role,
        templateReviewer: input.templateReviewer,
        invitedBy: caller.email,
        expiresAt,
        acceptUrl,
        note: input.note || null,
      });
      audit.context = { ...audit.context, access_added: true, email_sent: mail.sent };
      if (!mail.sent) ctx.log("admin invite email failed", { requestId: ctx.requestId, error: mail.error });
      return { id, email: input.email, acceptUrl, accessAdded: true, emailSent: mail.sent, emailError: mail.sent ? null : "The email could not be sent. Send them the link yourself." };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/admins/invites/:id/cancel",
    summary: "Cancel an open invite. Also takes the email off the Cloudflare Access policy.",
    roles: OWNERS,
    input: z.object({ id: uuid, reason: z.string().trim().max(500).optional().nullable(), code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.invite_cancelled", table: "public.platform_admin_invites" },
    async handler(ctx) {
      const { input, userClient } = ctx;
      await rpc(await userClient(), "platform_admin_cancel_invite", { p_invite_id: input.id, p_reason: input.reason || null });
      const sync = await resyncAfter(ctx);
      return { id: input.id, status: "cancelled", accessRemoved: sync.accessUpdated, accessError: sync.accessError };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/admins/:id/role",
    summary: "Change an admin's role. The last owner cannot be demoted; a template reviewer cannot become a viewer.",
    roles: OWNERS,
    input: z.object({ id: uuid, role: ROLE, code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.role_changed", table: "public.platform_admins" },
    async handler({ input, audit, userClient, db }) {
      audit.context = { role: input.role };
      if (input.role === "viewer") {
        const target = await adminRow(db, input.id);
        if (target?.template_reviewer) throw new ApiError("conflict", "Turn off the template reviewer flag before making this admin a viewer.");
      }
      await rpc(await userClient(), "platform_admin_set_role", { p_user_id: input.id, p_role: input.role });
      return { userId: input.id, role: input.role };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/admins/:id/reviewer",
    summary: "Turn the template reviewer flag on or off (owners and operators only; never a viewer).",
    roles: OWNERS,
    input: z.object({ id: uuid, templateReviewer: boolish, code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.reviewer_changed", table: "public.platform_admins" },
    async handler({ input, audit, userClient, db }) {
      audit.context = { template_reviewer: input.templateReviewer };
      if (input.templateReviewer) {
        const target = await adminRow(db, input.id);
        if (!target) throw new ApiError("not_found", "That person is not a platform admin");
        if (target.role === "viewer") throw new ApiError("conflict", VIEWER_REVIEWER_MESSAGE);
      }
      await rpc(await userClient(), "platform_admin_set_reviewer", { p_user_id: input.id, p_template_reviewer: input.templateReviewer });
      return { userId: input.id, templateReviewer: input.templateReviewer };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/admins/:id/remove",
    summary: "Remove an admin (kept in removals) and take them off the Cloudflare Access policy. The last owner cannot be removed.",
    roles: OWNERS,
    input: z.object({ id: uuid, reason: reason(3, 500), code: optionalCode, confirmEmail: z.string().trim().toLowerCase().email("Type the admin's email to confirm") }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.removed", table: "public.platform_admins" },
    async handler(ctx) {
      const { input, userClient, db } = ctx;
      const target = await adminRow(db, input.id);
      if (!target) {
        throw new ApiError("not_found", "That person is not a platform admin");
      }
      if (target.email.toLowerCase() !== input.confirmEmail) {
        throw new ApiError("validation_failed", "The email typed does not match the admin being removed", { issues: [{ path: "confirmEmail", message: "Does not match" }] });
      }
      await rpc(await userClient(), "platform_admin_remove", { p_user_id: input.id, p_reason: input.reason });
      const sync = await resyncAfter(ctx);
      return { userId: input.id, removed: true, accessRemoved: sync.accessUpdated, accessError: sync.accessError };
    },
  }),
];
