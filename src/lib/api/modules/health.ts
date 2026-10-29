import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { limit, offset, optionalCode, reason, uuid } from "../schemas";

type EventDetail = { id: string; organization_id: string | null; status: string } & Record<string, unknown>;

export const healthEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/health",
    summary: "Outbox counts by status, oldest pending age, failures by type.",
    roles: ALL_ROLES,
    input: z.object({}).passthrough().transform(() => ({})),
    handler: ({ db }) => rpc(db, "platform_outbox_health"),
  }),
  defineEndpoint({
    method: "GET",
    path: "/health/dead-letters",
    summary: "Dead-lettered events (no payloads).",
    roles: ALL_ROLES,
    input: z.object({ eventType: z.string().trim().max(120).optional(), limit: limit(200, 50), offset }),
    handler: ({ db, input }) => rpc(db, "platform_dead_letters", { p_event_type: input.eventType || null, p_limit: input.limit, p_offset: input.offset }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/health/dead-letters/:id",
    summary: "One event: metadata, payload keys and size, error, and its retry history.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    handler: async ({ db, input }) => must(await rpc<EventDetail | null>(db, "platform_outbox_event", { p_event_id: input.id }), "Event"),
  }),
  defineEndpoint({
    method: "POST",
    path: "/health/dead-letters/:id/retry",
    summary: "Put a dead-lettered event back in the queue. Your own session with a fresh step-up; reason 8 to 500 characters.",
    roles: OPERATORS,
    input: z.object({ id: uuid, reason: reason(8, 500), code: optionalCode }),
    session: "step_up",
    audit: { action: "health.replay", table: "public.outbox_events" },
    async handler({ db, input, audit, userClient }) {
      const event = must(await rpc<EventDetail | null>(db, "platform_outbox_event", { p_event_id: input.id }), "Event");
      audit.organizationId = event.organization_id;
      const client = await userClient();
      return rpc(client, "platform_replay_outbox_event", { p_event_id: input.id, p_reason: input.reason });
    },
  }),
];
