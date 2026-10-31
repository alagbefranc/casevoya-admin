import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, rpc } from "../core";
import { ApiError } from "../errors";
import { limit, offset, optionalCode, uuid } from "../schemas";

/**
 * Lost two-step device (app migration 20261102100100). When a firm's only owner loses their
 * two-step device, their reset request comes here instead of to the firm. A platform admin confirms
 * it's really them (video call or in person), then approves or denies within 24 hours. The database
 * refuses expired requests and the admin's own request; approving ends the person's sessions and
 * retires their recovery codes, then this endpoint removes their factors with the Auth admin API and
 * calls complete_mfa_reset. The person is emailed the outcome (EX22).
 */
export const RESET_STATES = ["pending", "closed"] as const;

type Decided = { id: string; status: string; refused?: string; requester_user_id?: string };

export const resetEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/resets",
    summary: "Two-step reset requests from firms' only owners (pending or closed), with counts.",
    roles: ALL_ROLES,
    input: z.object({ state: z.enum(RESET_STATES).optional(), limit: limit(200, 50), offset }),
    handler: ({ db, input }) => rpc(db, "platform_mfa_resets", { p_state: input.state ?? "pending", p_limit: input.limit, p_offset: input.offset }),
  }),
  defineEndpoint({
    method: "POST",
    path: "/resets/:id/decide",
    summary: "Approve or deny a pending two-step reset request. Approving removes the person's two-step methods.",
    roles: OPERATORS,
    input: z.object({
      id: uuid,
      approve: z.boolean(),
      note: z.string().trim().max(500, "A note is at most 500 characters").optional().nullable(),
      confirmIdentity: z.boolean().optional(),
      code: optionalCode,
    }).superRefine((v, ctx) => {
      if (v.approve && v.confirmIdentity !== true) ctx.addIssue({ code: "custom", path: ["confirmIdentity"], message: "Confirm you checked it's really them before approving" });
    }),
    sensitive: true,
    session: "step_up",
    serviceStepUp: true,
    auditRequired: true,
    auditObjectId: (_caller, input) => input.id,
    audit: { action: "mfa_reset.decided", table: "public.mfa_reset_requests" },
    async handler({ db, input, audit, admin }) {
      const result = await rpc<Decided>(db, "platform_decide_mfa_reset", {
        p_id: input.id,
        p_approve: input.approve,
        p_note: input.note || null,
        p_admin_user_id: admin.userId,
      });
      audit.context = { approve: input.approve, status: result.status };
      if (result.refused === "expired") throw new ApiError("conflict", "This request expired after 24 hours. The owner can send a new one.");
      let removed = 0;
      if (input.approve && result.requester_user_id) {
        const listed = await db.auth.admin.mfa.listFactors({ userId: result.requester_user_id });
        if (listed.error) throw new ApiError("internal", "Approved, but the two-step methods could not be listed. The request is approved and their sessions ended; remove the factors in Supabase Auth.");
        for (const factor of listed.data?.factors ?? []) {
          const deleted = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: result.requester_user_id });
          if (deleted.error) throw new ApiError("internal", "Approved, but a two-step method could not be removed.");
          removed += 1;
        }
        await rpc(db, "complete_mfa_reset", { p_id: input.id, p_factors_removed: removed });
      }
      audit.context = { approve: input.approve, status: result.status, factors_removed: removed };
      return { id: result.id, status: result.status, factorsRemoved: removed };
    },
  }),
];
