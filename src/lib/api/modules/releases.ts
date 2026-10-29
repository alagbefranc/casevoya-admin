import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { limit, offset } from "../schemas";

export const APP_RELEASE_NOTES_GAP =
  "No data source yet: app release notes are not stored anywhere the portal can read. Planned: a release_notes table written at deploy time.";

export const releaseEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/releases/templates",
    summary: "Shared template versions that reached firms (published, superseded, rolled back), newest first, with adopting firm counts.",
    roles: ALL_ROLES,
    input: z.object({ limit: limit(200, 50), offset }),
    handler: ({ db, input }) => rpc(db, "platform_template_releases", { p_limit: input.limit, p_offset: input.offset }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/releases/app-notes",
    summary: "App release notes. Read-only stub: always empty until a data source exists.",
    roles: ALL_ROLES,
    input: z.object({ limit: limit(200, 50), offset }),
    handler: async ({ input }) => ({ items: [], total: 0, limit: input.limit, offset: input.offset, stub: true, gap: APP_RELEASE_NOTES_GAP }),
  }),
];
