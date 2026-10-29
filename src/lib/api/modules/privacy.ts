import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { limit, offset, uuid } from "../schemas";

export const BREACH_REGISTER_GAP =
  "No data source yet: there is no breach (privacy incident) register table. Firms record breaches outside Casevoya today.";

export const privacyEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/privacy/requests",
    summary:
      "Privacy requests across firms, metadata only (reference, kind, channel, dates, stage, outcome; never the requester, details or notes). open / overdue / due_soon (5 days) / closed / all.",
    roles: ALL_ROLES,
    input: z.object({
      state: z.enum(["open", "overdue", "due_soon", "closed", "all"]).default("open"),
      organizationId: uuid.optional(),
      limit: limit(200, 50),
      offset,
    }),
    handler: ({ db, input }) =>
      rpc(db, "platform_privacy_requests", {
        p_state: input.state,
        p_organization_id: input.organizationId ?? null,
        p_limit: input.limit,
        p_offset: input.offset,
      }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/privacy/breaches",
    summary: "Breach register. Read-only stub: always empty until a data source exists.",
    roles: ALL_ROLES,
    input: z.object({ limit: limit(200, 50), offset }),
    handler: async ({ input }) => ({ items: [], total: 0, limit: input.limit, offset: input.offset, stub: true, gap: BREACH_REGISTER_GAP }),
  }),
];
