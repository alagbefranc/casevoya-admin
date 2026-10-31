import { z } from "zod";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { ApiError, fromDbError } from "../errors";
import { isoTime, limit, offset, optionalCode, uuid } from "../schemas";

export const NOTICE_KINDS = ["maintenance", "incident", "info"] as const;
export const NOTICE_SEVERITIES = ["info", "minor", "major"] as const;
export const NOTICE_STATUSES = ["draft", "published", "resolved"] as const;

const NOTICE_COLUMNS =
  "id, kind, severity, title, body, starts_at, ends_at, status, audience, published_at, resolved_at, resolved_by, resolution_note, created_by, updated_by, created_at, updated_at, version";

type NoticeRow = { id: string; status: string; starts_at: string | null; ends_at: string | null; audience: string } & Record<string, unknown>;

/** live: published and inside its window. scheduled: published, starts later. ended: published, past ends_at. */
export function phaseOf(n: Pick<NoticeRow, "status" | "starts_at" | "ends_at">, now = Date.now()): "draft" | "scheduled" | "live" | "ended" | "resolved" {
  if (n.status === "draft") return "draft";
  if (n.status === "resolved") return "resolved";
  if (n.starts_at && Date.parse(n.starts_at) > now) return "scheduled";
  if (n.ends_at && Date.parse(n.ends_at) <= now) return "ended";
  return "live";
}

const title = z.string().trim().min(3, "The title is 3 to 120 characters").max(120, "The title is 3 to 120 characters");
const body = z.string().trim().min(1, "The notice text is 1 to 1000 characters").max(1000, "The notice text is 1 to 1000 characters");

export const postNoticeInput = z
  .object({
    kind: z.enum(NOTICE_KINDS),
    severity: z.enum(NOTICE_SEVERITIES).default("minor"),
    title,
    body,
    startsAt: isoTime.optional().nullable(),
    endsAt: isoTime.optional().nullable(),
    audience: z.enum(["all", "listed"]),
    organizationIds: z.array(uuid).max(1000, "List at most 1000 firms").default([]),
    publish: z.boolean().default(true),
    code: optionalCode,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "maintenance" && !v.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Maintenance needs an end time" });
    if (v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt ?? new Date().toISOString())) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end time is after the start time" });
    if (v.audience === "listed" && v.organizationIds.length === 0) ctx.addIssue({ code: "custom", path: ["organizationIds"], message: "Choose at least one firm, or all firms" });
    if (v.audience === "all" && v.organizationIds.length > 0) ctx.addIssue({ code: "custom", path: ["organizationIds"], message: "All-firm notices list no firms" });
  });

export const updateNoticeInput = z
  .object({
    id: uuid,
    severity: z.enum(NOTICE_SEVERITIES).optional(),
    title: title.optional(),
    body: body.optional(),
    startsAt: isoTime.optional().nullable(),
    endsAt: isoTime.optional().nullable(),
    publish: z.boolean().default(false),
    code: optionalCode,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end time is after the start time" });
  });

async function loadNotice(db: import("@supabase/supabase-js").SupabaseClient, id: string): Promise<NoticeRow> {
  const { data, error } = await db.from("service_notices").select(NOTICE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  return must(data as NoticeRow | null, "Notice");
}

async function targetsOf(db: import("@supabase/supabase-js").SupabaseClient, ids: string[]): Promise<Map<string, { id: string; display_name: string }[]>> {
  const out = new Map<string, { id: string; display_name: string }[]>();
  if (!ids.length) return out;
  const { data, error } = await db.from("service_notice_targets").select("notice_id, organization_id").in("notice_id", ids);
  if (error) throw fromDbError(error);
  const orgIds = [...new Set((data ?? []).map((t) => t.organization_id as string))];
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs, error: orgError } = await db.from("organizations").select("id, display_name").in("id", orgIds);
    if (orgError) throw fromDbError(orgError);
    for (const o of orgs ?? []) names.set(o.id as string, o.display_name as string);
  }
  for (const t of data ?? []) {
    const list = out.get(t.notice_id as string) ?? [];
    list.push({ id: t.organization_id as string, display_name: names.get(t.organization_id as string) ?? "(unknown firm)" });
    out.set(t.notice_id as string, list);
  }
  return out;
}

export const noticeEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/notices",
    summary: "Service notices, newest first, with their phase and target firms.",
    roles: ALL_ROLES,
    input: z.object({ status: z.enum(NOTICE_STATUSES).optional(), limit: limit(200, 50), offset }),
    async handler({ db, input }) {
      let query = db.from("service_notices").select(NOTICE_COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).range(input.offset, input.offset + input.limit - 1);
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query;
      if (error) throw fromDbError(error);
      const rows = (data ?? []) as NoticeRow[];
      const targets = await targetsOf(db, rows.filter((r) => r.audience !== "all").map((r) => r.id));
      return {
        items: rows.map((r) => ({ ...r, phase: phaseOf(r), targets: targets.get(r.id) ?? [] })),
        total: count ?? rows.length,
        limit: input.limit,
        offset: input.offset,
      };
    },
  }),
  defineEndpoint({
    method: "GET",
    path: "/notices/:id",
    summary: "One notice with targets and its change history.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    async handler({ db, input }) {
      const notice = await loadNotice(db, input.id);
      const targets = await targetsOf(db, [notice.id]);
      const history = await rpc(db, "platform_audit_log", { p_object_id: notice.id, p_limit: 100 });
      return { notice: { ...notice, phase: phaseOf(notice), targets: targets.get(notice.id) ?? [] }, history };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/notices",
    summary:
      "Post a notice (draft or published) to all firms or listed firms. Your own session; publishing needs a fresh step-up, proven to the database with your own session first.",
    roles: OPERATORS,
    input: postNoticeInput,
    session: (input) => (input.publish ? "step_up" : "required"),
    serviceStepUp: true,
    auditRequired: (input) => input.publish,
    status: 201,
    audit: { action: "notices.posted", table: "public.service_notices" },
    async handler({ db, input, audit, admin }) {
      const id = await rpc<string>(db, "post_service_notice", {
        p_kind: input.kind,
        p_severity: input.severity,
        p_title: input.title,
        p_body: input.body,
        p_starts_at: input.startsAt ?? null,
        p_ends_at: input.endsAt ?? null,
        p_organization_ids: input.audience === "all" ? null : input.organizationIds,
        p_publish: input.publish,
        p_acting_admin: admin.userId,
      });
      audit.objectId = id;
      audit.context = { kind: input.kind, severity: input.severity, audience: input.audience, firms: input.organizationIds.length, publish: input.publish };
      const notice = await loadNotice(db, id);
      return { ...notice, phase: phaseOf(notice) };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/notices/:id",
    summary:
      "Edit a draft or published notice; publish: true publishes a draft. Resolved notices are frozen. Fresh step-up, proven to the database with your own session first.",
    roles: OPERATORS,
    input: updateNoticeInput,
    // Any edit may change what firms already see (a published notice), so every edit needs the step-up.
    session: "step_up",
    serviceStepUp: true,
    auditRequired: true,
    audit: { action: "notices.updated", table: "public.service_notices" },
    async handler({ db, input, audit, admin }) {
      const current = await loadNotice(db, input.id);
      if (current.status === "resolved") throw new ApiError("conflict", "A resolved notice cannot change; post a new one");
      await rpc(db, "update_service_notice", {
        p_notice_id: input.id,
        p_severity: input.severity ?? null,
        p_title: input.title ?? null,
        p_body: input.body ?? null,
        p_starts_at: input.startsAt ?? null,
        p_ends_at: input.endsAt ?? null,
        p_publish: input.publish,
        p_acting_admin: admin.userId,
      });
      audit.context = { publish: input.publish, from_status: current.status };
      const notice = await loadNotice(db, input.id);
      return { ...notice, phase: phaseOf(notice) };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/notices/:id/resolve",
    summary: "Resolve a notice with a note. Firms see it as resolved. Fresh step-up, proven to the database with your own session first.",
    roles: OPERATORS,
    input: z.object({ id: uuid, resolutionNote: z.string().trim().min(3, "Say how it was resolved (3 to 1000 characters)").max(1000), code: optionalCode }),
    session: "step_up",
    serviceStepUp: true,
    auditRequired: true,
    audit: { action: "notices.resolved", table: "public.service_notices" },
    async handler({ db, input, admin }) {
      await rpc(db, "resolve_service_notice", { p_notice_id: input.id, p_resolution_note: input.resolutionNote, p_acting_admin: admin.userId });
      const notice = await loadNotice(db, input.id);
      return { ...notice, phase: phaseOf(notice) };
    },
  }),
];
