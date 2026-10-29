import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { ApiError } from "../errors";
import { isoDate, optionalCode, reason, uuid } from "../schemas";
import { sourcesForDb } from "../../templates";

type VersionDetail = {
  version: { id: string; stable_key: string; status: string; author_user_id: string | null; template_id: string } & Record<string, unknown>;
  sources: { official: boolean }[];
  reviews: unknown[];
};

export const sourceInput = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .url("Each source is a public https link")
    .refine((v) => v.startsWith("https://"), "Each source is a public https link"),
  title: z.string().trim().max(200).optional().nullable(),
  retrievedOn: isoDate.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

const content = {
  title: z.string().trim().min(1, "The title is 1 to 160 characters").max(160, "The title is 1 to 160 characters"),
  summary: z.string().trim().max(2000, "The summary is at most 2000 characters").default(""),
  items: z.array(z.string().trim().min(1, "Each item is 1 to 200 characters").max(200, "Each item is 1 to 200 characters")).min(1, "Add at least one item").max(80, "A template has at most 80 items"),
  testEvidence: z.string().trim().min(8, "Test evidence is 8 to 2000 characters").max(2000, "Test evidence is 8 to 2000 characters"),
  effectiveOn: isoDate,
  changelog: z.string().trim().min(3, "The changelog is 3 to 2000 characters").max(2000, "The changelog is 3 to 2000 characters"),
  sources: z.array(sourceInput).min(1, "Cite at least one source").max(20, "Cite at most 20 sources"),
};

export const draftInput = z.object({
  stableKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,60}$/, "The template key is lowercase words joined by _ (2 to 61 characters)"),
  authorName: z.string().trim().min(1, "Name the author").max(120, "The author name is at most 120 characters"),
  ...content,
});

export const reviseInput = z.object({ id: uuid, ...content });

async function versionDetail(db: SupabaseClient, id: string): Promise<VersionDetail> {
  return must(await rpc<VersionDetail | null>(db, "platform_template_version", { p_version_id: id }), "Template version");
}

async function setSources(db: SupabaseClient, versionId: string, sources: z.infer<typeof sourceInput>[], actor: string, verb: string): Promise<void> {
  try {
    await rpc(db, "set_shared_template_version_sources", { p_version_id: versionId, p_sources: sourcesForDb(sources), p_actor: actor });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(error.code, `${verb}, but its sources were not saved: ${error.message}`, { versionId, issues: [{ path: "sources", message: error.message }] });
    }
    throw error;
  }
}

function withHints(detail: VersionDetail, userId: string) {
  return {
    ...detail,
    hints: {
      isAuthor: detail.version.author_user_id === userId,
      hasOfficialSource: detail.sources.some((s) => s.official),
    },
  };
}

const decision = (action: "approve" | "reject" | "rollback") =>
  defineEndpoint({
    method: "POST",
    path: `/templates/versions/:id/${action}`,
    summary:
      action === "approve"
        ? "Approve and publish a draft. Template reviewer with a verified licence, own session, fresh step-up, not the author."
        : action === "reject"
          ? "Reject a draft with a reason. Same reviewer rules as approve."
          : "Withdraw the published version and restore the one it replaced. Same reviewer rules.",
    roles: OPERATORS,
    reviewer: true,
    input:
      action === "approve"
        ? (z.object({ id: uuid, code: optionalCode, confirmCompared: z.literal(true, { message: "Confirm you compared the draft with the published version and its sources" }) }) as z.ZodType<{ id: string; code?: string; reason?: string }>)
        : (z.object({ id: uuid, code: optionalCode, reason: reason(3, 500) }) as z.ZodType<{ id: string; code?: string; reason?: string }>),
    session: "step_up",
    audit: { action: `templates.${action}`, table: "public.shared_template_versions" },
    async handler({ input, userClient, db, caller }) {
      const i = input as { id: string; reason?: string };
      const client = await userClient();
      const fn = { approve: "approve_shared_template_version", reject: "reject_shared_template_version", rollback: "rollback_shared_template_version" }[action];
      const result = await rpc(client, fn, action === "approve" ? { p_version_id: i.id } : { p_version_id: i.id, p_reason: i.reason });
      return { result, version: withHints(await versionDetail(db, i.id), caller.userId) };
    },
  });

export const templateEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/templates",
    summary: "Every shared template with its published version, open draft and adoption count.",
    roles: ALL_ROLES,
    input: z.object({}).passthrough().transform(() => ({})),
    handler: ({ db }) => rpc(db, "platform_template_queue"),
  }),
  defineEndpoint({
    method: "GET",
    path: "/templates/official-domains",
    summary: "The official-source allow list (for hints next to source links).",
    roles: ALL_ROLES,
    input: z.object({}).passthrough().transform(() => ({})),
    async handler({ db }) {
      const { data, error } = await db.from("official_source_domains").select("host, match_kind, authority").order("host").limit(500);
      if (error) throw new ApiError("upstream_error", error.message);
      return { items: data ?? [] };
    },
  }),
  defineEndpoint({
    method: "GET",
    path: "/templates/history/:key",
    summary: "All versions of one template, newest first.",
    roles: ALL_ROLES,
    input: z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/, "Unknown template key") }),
    handler: ({ db, input }) => rpc(db, "shared_template_history", { p_stable_key: input.key }),
  }),
  defineEndpoint({
    method: "GET",
    path: "/templates/versions/:id",
    summary: "One version with its sources, reviews, the diff against the published version, and hints for you.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    async handler({ db, input, caller }) {
      const detail = await versionDetail(db, input.id);
      const diff = await rpc(db, "shared_template_diff", { p_version_id: input.id });
      return { ...withHints(detail, caller.userId), diff };
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/templates/drafts",
    summary: "Write a new draft version (you are the author) with its sources.",
    roles: OPERATORS,
    input: draftInput,
    status: 201,
    audit: { action: "templates.draft_created", table: "public.shared_template_versions" },
    async handler({ db, input, audit, admin }) {
      const id = await rpc<string>(db, "draft_shared_template_version", {
        p_stable_key: input.stableKey,
        p_title: input.title,
        p_summary: input.summary,
        p_items: input.items,
        p_author_name: input.authorName,
        p_author_user_id: admin.userId,
        p_test_evidence: input.testEvidence,
        p_effective_on: input.effectiveOn,
        p_changelog: input.changelog,
      });
      audit.objectId = id;
      audit.context = { stable_key: input.stableKey, sources: input.sources.length };
      await setSources(db, id, input.sources, admin.userId, "The draft was saved");
      return withHints(await versionDetail(db, id), admin.userId);
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/templates/versions/:id",
    summary: "Revise your own open draft (content and sources).",
    roles: OPERATORS,
    input: reviseInput,
    audit: { action: "templates.draft_revised", table: "public.shared_template_versions" },
    async handler({ db, input, admin }) {
      const current = await versionDetail(db, input.id);
      if (current.version.status !== "draft") throw new ApiError("conflict", "Only an open draft is revised");
      if (current.version.author_user_id !== admin.userId) throw new ApiError("forbidden", "Only the draft's author revises it");
      await rpc(db, "revise_shared_template_draft", {
        p_version_id: input.id,
        p_title: input.title,
        p_summary: input.summary,
        p_items: input.items,
        p_test_evidence: input.testEvidence,
        p_effective_on: input.effectiveOn,
        p_changelog: input.changelog,
      });
      await setSources(db, input.id, input.sources, admin.userId, "The draft was revised");
      return withHints(await versionDetail(db, input.id), admin.userId);
    },
  }),
  decision("approve"),
  decision("reject"),
  decision("rollback"),
];
