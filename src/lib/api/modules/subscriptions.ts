import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { limit, offset } from "../schemas";

export const EXCEPTION_REASONS = ["past_due", "restricted", "trial_ended", "cancel_scheduled", "trial_ending", "invoice_unpaid"] as const;

export const subscriptionEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/subscriptions/exceptions",
    summary: "Subscriptions that need attention, by reason. Read-only: billing changes happen in Stripe.",
    roles: ALL_ROLES,
    input: z.object({ reason: z.enum(EXCEPTION_REASONS).optional(), limit: limit(200, 100), offset }),
    handler: ({ db, input }) => rpc(db, "platform_subscription_exceptions", { p_reason: input.reason ?? null, p_limit: input.limit, p_offset: input.offset }),
  }),
];
