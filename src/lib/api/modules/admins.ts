import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNERS, defineEndpoint, rpc } from "../core";
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
    summary: "Invite someone by email (1 to 30 days). No email is sent; tell them, and add them to Access and ADMIN_ALLOWED_EMAILS.",
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
    async handler({ input, audit, userClient, caller }) {
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
      return {
        id,
        accessReady: caller.env.allowedEmails.includes(input.email),
        nextSteps: [
          "Add the email to the Cloudflare Access policy for admin.casevoya.ca.",
          "Add the email to ADMIN_ALLOWED_EMAILS in casevoya-admin/wrangler.jsonc and deploy.",
          "Tell them to sign in to admin.casevoya.ca and accept the invite (they need a Casevoya account with an authenticator app).",
        ],
      };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/admins/invites/:id/cancel",
    summary: "Cancel an open invite.",
    roles: OWNERS,
    input: z.object({ id: uuid, reason: z.string().trim().max(500).optional().nullable(), code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.invite_cancelled", table: "public.platform_admin_invites" },
    async handler({ input, userClient }) {
      await rpc(await userClient(), "platform_admin_cancel_invite", { p_invite_id: input.id, p_reason: input.reason || null });
      return { id: input.id, status: "cancelled" };
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
    summary: "Remove an admin (kept in removals). The last owner cannot be removed.",
    roles: OWNERS,
    input: z.object({ id: uuid, reason: reason(3, 500), code: optionalCode, confirmEmail: z.string().trim().toLowerCase().email("Type the admin's email to confirm") }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "admins.removed", table: "public.platform_admins" },
    async handler({ input, userClient, db }) {
      const target = await adminRow(db, input.id);
      if (!target) {
        throw new ApiError("not_found", "That person is not a platform admin");
      }
      if (target.email.toLowerCase() !== input.confirmEmail) {
        throw new ApiError("validation_failed", "The email typed does not match the admin being removed", { issues: [{ path: "confirmEmail", message: "Does not match" }] });
      }
      await rpc(await userClient(), "platform_admin_remove", { p_user_id: input.id, p_reason: input.reason });
      return { userId: input.id, removed: true };
    },
  }),
];
