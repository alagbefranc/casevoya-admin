import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";

type Overview = { firms: { by_verification: Record<string, number> }; licences: Record<string, number>; verification_workload: Record<string, number> };

export const verificationEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/verification/summary",
    summary: "Firm verification counts, licence queue counts and the latest CICC import, for the Verification page header.",
    roles: ALL_ROLES,
    input: z.object({}),
    async handler({ db }) {
      const overview = await rpc<Overview>(db, "platform_overview");
      const imports = await rpc<{ imports?: unknown[] | null } | null>(db, "platform_cicc_imports", { p_limit: 1 });
      const list = imports?.imports ?? [];
      return {
        firmsByVerification: overview.firms?.by_verification ?? {},
        licenceCounts: overview.licences ?? {},
        workload: overview.verification_workload ?? {},
        latestCiccImport: list[0] ?? null,
      };
    },
  }),
];
