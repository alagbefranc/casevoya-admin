import { z } from "zod";
import { ALL_ROLES, defineEndpoint, rpc } from "../core";
import { empty } from "../schemas";

export const overviewEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/overview",
    summary: "Platform metrics: firms, subscriptions, queues, licences, incidents, support, templates, complaints.",
    roles: ALL_ROLES,
    input: empty,
    handler: ({ db }) => rpc(db, "platform_overview"),
  }),
  defineEndpoint({
    method: "GET",
    path: "/overview/support-sla",
    summary: "Support response times against a target over the last N days.",
    roles: ALL_ROLES,
    input: z.object({ days: z.coerce.number().int().min(1).max(365).default(30), targetMinutes: z.coerce.number().int().min(5).max(10080).default(1440) }),
    handler: ({ db, input }) => rpc(db, "platform_support_sla", { p_days: input.days, p_target_minutes: input.targetMinutes }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/overview/complaints",
    summary: "Complaint workload across firms (counts and overdue, no complaint text).",
    roles: ALL_ROLES,
    input: empty,
    handler: ({ db }) => rpc(db, "platform_complaints_overview"),
  }),
];
