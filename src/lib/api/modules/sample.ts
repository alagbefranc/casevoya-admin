import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { limit, offset } from "../schemas";

export const sampleEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/sample-mode",
    summary:
      "Firms in sample mode or holding sample rows: sample counts, proof steps done, and firms mixing sample and real matters. Read-only: a firm owner turns sample mode on or off in Casevoya.",
    roles: ALL_ROLES,
    input: z.object({ limit: limit(200, 100), offset }),
    handler: ({ db, input }) => rpc(db, "platform_sample_overview", { p_limit: input.limit, p_offset: input.offset }),
  }),
];
