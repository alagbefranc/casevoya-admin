import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { isoTime, limit, uuid } from "../schemas";

export const auditEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/audit",
    summary: "Audit log (platform, admin portal, support, licence, template, notice, outbox families), newest first, cursor paging.",
    roles: ALL_ROLES,
    input: z
      .object({
        actionPrefix: z.string().trim().regex(/^[a-z_][a-z0-9_.]{0,80}$/, "Use an action prefix like admin_portal. or template.").optional(),
        actorUserId: uuid.optional(),
        organizationId: uuid.optional(),
        objectId: uuid.optional(),
        result: z.enum(["success", "denied", "failure"]).optional(),
        from: isoTime.optional(),
        to: isoTime.optional(),
        beforeAt: isoTime.optional(),
        beforeId: uuid.optional(),
        limit: limit(200, 50),
      })
      .superRefine((v, ctx) => {
        if (Boolean(v.beforeAt) !== Boolean(v.beforeId)) ctx.addIssue({ code: "custom", path: ["beforeAt"], message: "Send beforeAt and beforeId together (from next_cursor)" });
        if (v.from && v.to && Date.parse(v.from) > Date.parse(v.to)) ctx.addIssue({ code: "custom", path: ["from"], message: "From is before To" });
      }),
    handler: ({ db, input }) =>
      rpc(db, "platform_audit_log", {
        p_action_prefix: input.actionPrefix ?? null,
        p_actor_user_id: input.actorUserId ?? null,
        p_organization_id: input.organizationId ?? null,
        p_result: input.result ?? null,
        p_from: input.from ?? null,
        p_to: input.to ?? null,
        p_before_at: input.beforeAt ?? null,
        p_before_id: input.beforeId ?? null,
        p_limit: input.limit,
        p_object_id: input.objectId ?? null,
      }),
  }),
];
