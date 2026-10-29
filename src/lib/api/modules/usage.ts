import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { boolish, limit, offset } from "../schemas";

export const USAGE_SORTS = ["name_asc", "seats_desc", "matters_desc", "storage_desc", "ai_cost_desc"] as const;

export const usageEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/usage",
    summary:
      "Per-firm seats, active matters, storage and Vo (AI) usage over 30 days against plan allowances, with near (>= 90%) and over flags. Counts only.",
    roles: ALL_ROLES,
    input: z.object({
      search: z.string().trim().max(100, "Search is at most 100 characters").optional(),
      flaggedOnly: boolish.default(false),
      sort: z.enum(USAGE_SORTS).default("name_asc"),
      limit: limit(200, 50),
      offset,
    }),
    handler: ({ db, input }) =>
      rpc(db, "platform_usage", {
        p_search: input.search || null,
        p_flagged_only: input.flaggedOnly,
        p_sort: input.sort,
        p_limit: input.limit,
        p_offset: input.offset,
      }),
  }),
];
