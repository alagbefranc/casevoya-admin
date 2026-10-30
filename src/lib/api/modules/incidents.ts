import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { fromDbError } from "../errors";
import { limit, offset } from "../schemas";
import { phaseOf } from "./notices";

const COLUMNS = "id, kind, severity, title, starts_at, ends_at, status, audience, published_at, resolved_at, resolution_note, created_at, updated_at";

type Row = { id: string; status: string; starts_at: string | null; ends_at: string | null; resolved_at: string | null; published_at: string | null } & Record<string, unknown>;

/** Minutes from start (or publish) to resolution; null while open. */
export function durationMinutes(r: Pick<Row, "starts_at" | "published_at" | "resolved_at">): number | null {
  const start = r.starts_at ?? r.published_at;
  if (!start || !r.resolved_at) return null;
  return Math.max(0, Math.round((Date.parse(r.resolved_at) - Date.parse(start)) / 60000));
}

export const incidentEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/incidents",
    summary:
      "The incident log: service notices of kind incident (and optionally maintenance), with phase and duration, plus the current platform status and queue health. Incidents are posted and resolved through /notices.",
    roles: ALL_ROLES,
    input: z.object({
      state: z.enum(["open", "resolved", "all"]).default("all"),
      kind: z.enum(["incident", "maintenance", "both"]).default("incident"),
      limit: limit(200, 50),
      offset,
    }),
    async handler({ db, input }) {
      let query = db
        .from("service_notices")
        .select(COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      query = input.kind === "both" ? query.in("kind", ["incident", "maintenance"]) : query.eq("kind", input.kind);
      if (input.state === "open") query = query.neq("status", "resolved");
      if (input.state === "resolved") query = query.eq("status", "resolved");
      const { data, error, count } = await query;
      if (error) throw fromDbError(error);
      const rows = (data ?? []) as Row[];
      const overview = await rpc<{ incidents: unknown; queues: unknown }>(db, "platform_overview");
      return {
        current: { status: overview.incidents, queues: overview.queues },
        items: rows.map((r) => ({ ...r, phase: phaseOf(r), duration_minutes: durationMinutes(r) })),
        total: count ?? rows.length,
        limit: input.limit,
        offset: input.offset,
      };
    },
  }),
];
