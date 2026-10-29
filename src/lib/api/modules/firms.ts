import { z } from "zod";
import { ALL_ROLES, defineEndpoint, must, rpc } from "../core";
import { boolish, limit, offset, uuid } from "../schemas";

export const VERIFICATION = ["unverified", "pending_review", "verified", "restricted"] as const;
export const SUBSCRIPTION_FILTER = ["trial", "trial_ended", "active", "cancelled", "past_due", "restricted", "archived", "none", "exception"] as const;
export const PLANS = ["solo", "practice", "firm", "enterprise"] as const;
export const FIRM_SORTS = ["created_desc", "created_asc", "name_asc", "name_desc"] as const;

type FirmDetail = { firm: { id: string; display_name: string; verification_status: string }; credentials: { id: string }[] } & Record<string, unknown>;

export const firmEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/firms",
    summary: "Firms with search, filters and pagination.",
    roles: ALL_ROLES,
    input: z.object({
      search: z.string().trim().max(100, "Search is at most 100 characters").optional(),
      verification: z.enum(VERIFICATION).optional(),
      subscription: z.enum(SUBSCRIPTION_FILTER).optional(),
      plan: z.enum(PLANS).optional(),
      sample: boolish.optional(),
      sort: z.enum(FIRM_SORTS).default("created_desc"),
      limit: limit(200, 50),
      offset,
    }),
    handler: ({ db, input }) =>
      rpc(db, "platform_firm_list", {
        p_search: input.search || null,
        p_verification: input.verification ?? null,
        p_subscription: input.subscription ?? null,
        p_plan: input.plan ?? null,
        p_sample: input.sample ?? null,
        p_sort: input.sort,
        p_limit: input.limit,
        p_offset: input.offset,
      }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/firms/:id",
    summary: "One firm: subscription, events, invoices, members, credentials, support, complaints counts, outbox.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    handler: async ({ db, input }) => must(await rpc<FirmDetail | null>(db, "platform_firm_detail", { p_organization_id: input.id }), "Firm"),
  }),
  defineEndpoint({
    method: "GET",
    path: "/firms/:id/verification",
    summary: "Why the firm has its verification status: every credential with its checks.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    async handler({ db, input }) {
      const detail = must(await rpc<FirmDetail | null>(db, "platform_firm_detail", { p_organization_id: input.id }), "Firm");
      const credentials = await Promise.all((detail.credentials ?? []).map((c) => rpc(db, "platform_credential_detail", { p_credential_id: c.id })));
      return {
        firm: { id: detail.firm.id, display_name: detail.firm.display_name, verification_status: detail.firm.verification_status },
        credentials,
        rule: "After every licence check the firm becomes verified if it has a verified licence; a verified firm with no verified licence left and a credential that is revoked, suspended, inactive or not entitled becomes restricted; otherwise the status is left as it is (app.sync_firm_verification).",
      };
    },
  }),
];
