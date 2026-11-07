import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, rpc } from "../core";
import { ApiError } from "../errors";
import { limit, offset, optionalCode, uuid } from "../schemas";

/**
 * Find introductions (app migration 20261107170000, which needs 20261107160000).
 * The public page stores a consented request as New. A platform owner or operator sends one request
 * to one firm that is eligible at that moment. The database creates one lead. This module does not
 * email, and it does not read consultant_connect_requests itself.
 */

const MIGRATION_MESSAGE = "A database function the portal needs is missing (is the main-app migration applied?)";
const LIST_MESSAGE = "The referrals list could not be read.";
const SEND_MESSAGE = "The send did not return a lead. Nothing was marked sent.";
const FIRM_MESSAGE = "The firm list could not be read.";

const REQUEST_FIELDS = [
  "id",
  "status",
  "goal",
  "country",
  "code",
  "zone",
  "language",
  "name",
  "email",
  "submitted_at",
  "organization_id",
  "firm_name",
  "lead_id",
  "sent_at",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new ApiError("upstream_error", message);
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(message);
  return value as Record<string, unknown>;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Keeps the fields the screen shows and drops everything else, including an address hash. */
function publicRequest(value: unknown): Record<string, unknown> {
  const src = asRecord(value, LIST_MESSAGE);
  const status = src.status;
  if (status !== "New" && status !== "Sent") fail(LIST_MESSAGE);
  if (typeof src.id !== "string" || !UUID_RE.test(src.id)) fail(LIST_MESSAGE);
  if (typeof src.name !== "string" || typeof src.email !== "string" || typeof src.goal !== "string") fail(LIST_MESSAGE);
  if (typeof src.country !== "string" || typeof src.language !== "string" || typeof src.submitted_at !== "string") fail(LIST_MESSAGE);
  const out: Record<string, unknown> = {};
  for (const key of REQUEST_FIELDS) {
    if (key === "status" || key === "id" || key === "name" || key === "email" || key === "goal" || key === "country" || key === "language" || key === "submitted_at") {
      out[key] = src[key];
      continue;
    }
    const raw = src[key];
    out[key] = raw === undefined ? null : typeof raw === "string" || raw === null ? raw : null;
  }
  return out;
}

function publicList(data: unknown): { items: Record<string, unknown>[]; counts: { new: number; sent: number } } {
  if (data == null) throw new ApiError("upstream_error", MIGRATION_MESSAGE);
  const src = asRecord(data, LIST_MESSAGE);
  if (!Array.isArray(src.items)) fail(LIST_MESSAGE);
  const counts = asRecord(src.counts, LIST_MESSAGE);
  if (typeof counts.new !== "number" || typeof counts.sent !== "number") fail(LIST_MESSAGE);
  return {
    items: src.items.map((row) => publicRequest(row)),
    counts: { new: counts.new, sent: counts.sent },
  };
}

function publicFirms(data: unknown): { items: { id: string; display_name: string }[] } {
  if (data == null) throw new ApiError("upstream_error", MIGRATION_MESSAGE);
  const src = asRecord(data, FIRM_MESSAGE);
  if (!Array.isArray(src.items)) fail(FIRM_MESSAGE);
  const items: { id: string; display_name: string }[] = [];
  for (const row of src.items) {
    const firm = asRecord(row, FIRM_MESSAGE);
    const id = textOrNull(firm.id);
    const displayName = textOrNull(firm.display_name);
    if (!id || !UUID_RE.test(id) || !displayName) fail(FIRM_MESSAGE);
    items.push({ id, display_name: displayName });
  }
  return { items };
}

function publicSend(data: unknown): { id: string; status: "Sent"; organization_id: string; lead_id: string; replayed: boolean } {
  if (data == null) throw new ApiError("upstream_error", MIGRATION_MESSAGE);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("upstream_error", SEND_MESSAGE);
  const src = data as Record<string, unknown>;
  const id = textOrNull(src.id);
  const organizationId = textOrNull(src.organization_id);
  const leadId = textOrNull(src.lead_id);
  if (src.status !== "Sent" || !id || !UUID_RE.test(id) || !organizationId || !UUID_RE.test(organizationId) || !leadId || !UUID_RE.test(leadId) || typeof src.replayed !== "boolean") {
    throw new ApiError("upstream_error", SEND_MESSAGE);
  }
  return { id, status: "Sent", organization_id: organizationId, lead_id: leadId, replayed: src.replayed };
}

export const referralEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/referrals",
    summary: "Introduction requests submitted on Find, either still New or already Sent. The address hash is not included.",
    roles: ALL_ROLES,
    input: z.object({ state: z.enum(["new", "sent"]).optional(), limit: limit(200, 50), offset }),
    async handler({ db, input }) {
      const data = await rpc(db, "platform_consultant_connect_requests", {
        p_state: input.state ?? "new",
        p_limit: input.limit,
        p_offset: input.offset,
      });
      return publicList(data);
    },
  }),
  defineEndpoint({
    method: "GET",
    path: "/referrals/firms",
    summary: "Firms that can receive an introduction right now: opted in, not sample, open lead stage, verified licence.",
    roles: OPERATORS,
    input: z.object({}).strict(),
    async handler({ db }) {
      return publicFirms(await rpc(db, "platform_find_introduction_firms"));
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/referrals/:id/send",
    summary: "Send one New introduction to one firm and create one lead. The database rechecks eligibility. No email is sent.",
    roles: OPERATORS,
    input: z
      .object({
        id: uuid,
        organizationId: uuid,
        confirmSend: z.boolean(),
        code: optionalCode,
      })
      .superRefine((value, ctx) => {
        if (value.confirmSend !== true) {
          ctx.addIssue({ code: "custom", path: ["confirmSend"], message: "Confirm the send before it is made" });
        }
      }),
    sensitive: true,
    session: "step_up",
    serviceStepUp: true,
    auditRequired: true,
    auditObjectId: (_caller, input) => input.id,
    audit: { action: "find_introduction.sent", table: "public.consultant_connect_requests" },
    async handler({ db, input, audit, admin }) {
      const result = publicSend(
        await rpc(db, "platform_send_consultant_connect", {
          p_request: input.id,
          p_org: input.organizationId,
          p_admin_user_id: admin.userId,
        }),
      );
      audit.organizationId = result.organization_id;
      audit.objectId = result.id;
      audit.context = { lead_id: result.lead_id, replayed: result.replayed };
      return result;
    },
  }),
];
