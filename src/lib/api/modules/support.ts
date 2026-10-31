import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { fromDbError } from "../errors";
import { limit, offset, reason, uuid } from "../schemas";

export const SUPPORT_SCOPES = ["firm_settings", "matter_documents", "matter_records", "matter_all"] as const;
export const SUPPORT_STATES = ["pending", "active", "closed"] as const;

const REQUEST_COLUMNS =
  "id, organization_id, requested_by_user_id, requested_by_name, requested_by_email, ticket_ref, scope, matter_id, not_included, reason, requested_minutes, status, approved_at, starts_at, ends_at, ended_at, decline_reason, extension_count, created_at";

export const supportRequestInput = z
  .object({
    organizationId: uuid,
    scope: z.enum(SUPPORT_SCOPES),
    matterId: uuid.optional().nullable(),
    requesterName: z.string().trim().min(1, "Name the person asking (1 to 120 characters)").max(120),
    requesterEmail: z.string().trim().email("The requester email is invalid").max(320).optional().nullable(),
    ticketRef: z.string().trim().max(60, "The ticket reference is at most 60 characters").optional().nullable(),
    notIncluded: z.string().trim().max(500).optional().nullable(),
    reason: reason(8, 1000),
    minutes: z.number().int().min(15, "Support access lasts 15 to 240 minutes").max(240, "Support access lasts 15 to 240 minutes").default(60),
    confirmFirmNotified: z.literal(true, { message: "Confirm the firm's owners will be emailed and must approve" }),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "firm_settings" && v.matterId) ctx.addIssue({ code: "custom", path: ["matterId"], message: "Firm settings access names no matter" });
    if (v.scope !== "firm_settings" && !v.matterId) ctx.addIssue({ code: "custom", path: ["matterId"], message: "Matter access needs the matter id" });
  });

type RequestRow = { id: string; organization_id: string; status: string } & Record<string, unknown>;

export const supportEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/support/requests",
    summary: "Support access requests by state (pending, active, closed) with counts.",
    roles: ALL_ROLES,
    input: z.object({ state: z.enum(SUPPORT_STATES).optional(), organizationId: uuid.optional(), limit: limit(200, 50), offset }),
    handler: ({ db, input }) =>
      rpc(db, "platform_support_requests", { p_state: input.state ?? null, p_organization_id: input.organizationId ?? null, p_limit: input.limit, p_offset: input.offset }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/support/requests/:id",
    summary: "One request with its history (requested, approved, declined, used, expired, ended).",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    async handler({ db, input }) {
      const { data, error } = await db.from("support_access_requests").select(REQUEST_COLUMNS).eq("id", input.id).maybeSingle();
      if (error) throw fromDbError(error);
      const request = must(data as RequestRow | null, "Support request");
      const { data: firm } = await db.from("organizations").select("id, display_name").eq("id", request.organization_id).maybeSingle();
      const history = await rpc(db, "platform_support_request_history", { p_request_id: input.id });
      const now = Date.now();
      const endsAt = typeof request.ends_at === "string" ? Date.parse(request.ends_at) : null;
      const effective = request.status === "approved" && !request.ended_at && endsAt !== null && endsAt <= now ? "expired" : request.status;
      return {
        request: { ...request, effective_status: effective, minutes_left: request.status === "approved" && endsAt && endsAt > now ? Math.ceil((endsAt - now) / 60000) : null },
        firm: firm ?? null,
        history,
      };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/support/requests",
    summary: "Ask a firm for time-limited support access. The firm's owners are emailed and must approve in Casevoya.",
    roles: OPERATORS,
    input: supportRequestInput,
    sensitive: true,
    status: 201,
    audit: { action: "support.request_created", table: "public.support_access_requests" },
    async handler({ db, input, audit, admin }) {
      audit.organizationId = input.organizationId;
      const id = await rpc<string>(db, "create_support_access_request", {
        p_organization_id: input.organizationId,
        p_requester_name: input.requesterName,
        p_requester_email: input.requesterEmail || null,
        p_ticket_ref: input.ticketRef || null,
        p_scope: input.scope,
        p_matter_id: input.matterId || null,
        p_not_included: input.notIncluded || null,
        p_reason: input.reason,
        p_minutes: input.minutes,
        p_requested_by_user_id: admin.userId,
      });
      audit.objectId = id;
      audit.context = { scope: input.scope, minutes: input.minutes };
      return { id, status: "pending" };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/support/requests/:id/cancel",
    summary: "Withdraw a pending request, or end an approved grant early.",
    roles: OPERATORS,
    input: z.object({ id: uuid, reason: reason(3, 500) }),
    audit: { action: "support.request_cancelled", table: "public.support_access_requests" },
    async handler({ db, input, audit }) {
      const { data, error } = await db.from("support_access_requests").select("id, organization_id, status").eq("id", input.id).maybeSingle();
      if (error) throw fromDbError(error);
      const row = must(data as RequestRow | null, "Support request");
      audit.organizationId = row.organization_id;
      audit.context = { from_status: row.status };
      await rpc(db, "cancel_support_access_request", { p_id: input.id, p_reason: input.reason });
      const { data: after } = await db.from("support_access_requests").select("id, status, ended_at, decline_reason").eq("id", input.id).maybeSingle();
      return after;
    },
  }),
];
