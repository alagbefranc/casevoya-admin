import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { limit, offset, uuid } from "../schemas";

export const MIGRATION_STATUSES = ["staged", "checked", "committing", "committed", "rolled_back", "discarded", "stuck"] as const;

export const migrationEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/migration/jobs",
    summary:
      "Data import (migration) jobs across firms: status, row and file counts, pilot and commit timestamps, exception count, stuck (committing > 30 min) and purge-due flags. No file names or row content. Read-only.",
    roles: ALL_ROLES,
    input: z.object({ status: z.enum(MIGRATION_STATUSES).optional(), organizationId: uuid.optional(), limit: limit(200, 50), offset }),
    handler: ({ db, input }) =>
      rpc(db, "platform_migration_jobs", {
        p_status: input.status ?? null,
        p_organization_id: input.organizationId ?? null,
        p_limit: input.limit,
        p_offset: input.offset,
      }),
  }),
];
