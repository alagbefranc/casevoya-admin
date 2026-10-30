import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_ROLES, OPERATORS, defineEndpoint, must, rpc } from "../core";
import { ApiError, fromDbError } from "../errors";
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

type Submission = { status: string; submitted_at: string | null; submitted_by: string | null };

/** Review submission state (platform_template_version does not return it). Null when the version does not exist. */
async function submissionOf(db: SupabaseClient, id: string): Promise<Submission | null> {
  const { data, error } = await db.from("shared_template_versions").select("status, submitted_at, submitted_by").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  return (data as Submission | null) ?? null;
}

const REVIEW_HASH_RE = /^[0-9a-f]{64}$/;
export const REVIEW_CHANGED_MESSAGE = "This draft's content changed since you opened it. Reload the page and review it again before approving.";

/** The author's own open draft; `inReview` says which state the action needs. */
function requireOwnDraft(detail: VersionDetail, submission: Submission | null, userId: string, verb: string, inReview: boolean): void {
  if (detail.version.status !== "draft") throw new ApiError("conflict", "Only an open draft can be changed");
  if (detail.version.author_user_id !== userId) throw new ApiError("forbidden", `Only the draft's author ${verb} it`);
  const submitted = Boolean(submission?.submitted_at);
  if (inReview && !submitted) throw new ApiError("conflict", "This draft is not in review");
  if (!inReview && submitted) throw new ApiError("conflict", "This draft is in review. Withdraw it from review before changing it");
}

async function loadVersion(db: SupabaseClient, id: string, userId: string) {
  const detail = await versionDetail(db, id);
  return withHints(detail, userId, await submissionOf(db, id));
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

function withHints(detail: VersionDetail, userId: string, submission: Submission | null = null) {
  const inReview = detail.version.status === "draft" && Boolean(submission?.submitted_at);
  return {
    ...detail,
    hints: {
      isAuthor: detail.version.author_user_id === userId,
      hasOfficialSource: detail.sources.some((s) => s.official),
      inReview,
      submittedAt: inReview ? (submission?.submitted_at ?? null) : null,
    },
  };
}

type DecisionInput = { id: string; code?: string; reason?: string; reviewHash?: string; confirmRollback?: true };

const decision = (action: "approve" | "reject" | "rollback") =>
  defineEndpoint({
    method: "POST",
    path: `/templates/versions/:id/${action}`,
    summary:
      action === "approve"
        ? "Approve and publish a draft submitted for review, bound to the review hash shown with it. Template reviewer with a verified licence, own session, fresh step-up, not the author."
        : action === "reject"
          ? "Reject a draft with a reason. Same reviewer rules as approve."
          : "Withdraw the published version and restore the one it replaced. Same reviewer rules, plus an explicit confirmation and a reason.",
    roles: OPERATORS,
    reviewer: true,
    input:
      action === "approve"
        ? (z.object({
            id: uuid,
            code: optionalCode,
            confirmCompared: z.literal(true, { message: "Confirm you compared the draft with the published version and its sources" }),
            reviewHash: z.string().trim().toLowerCase().regex(REVIEW_HASH_RE, "Reload the version: the review fingerprint of what you reviewed is missing"),
          }) as z.ZodType<DecisionInput>)
        : action === "rollback"
          ? (z.object({
              id: uuid,
              code: optionalCode,
              reason: reason(3, 500),
              confirmRollback: z.literal(true, { message: "Confirm you want to withdraw the published version" }),
            }) as z.ZodType<DecisionInput>)
          : (z.object({ id: uuid, code: optionalCode, reason: reason(3, 500) }) as z.ZodType<DecisionInput>),
    session: "step_up",
    auditRequired: true,
    audit: { action: `templates.${action}`, table: "public.shared_template_versions" },
    async handler({ input, userClient, db, caller, audit }) {
      const i = input as DecisionInput;
      if (action === "approve" || action === "reject") {
        // Only a draft its author submitted for review is approved or rejected from the portal.
        const submission = must(await submissionOf(db, i.id), "Template version");
        if (submission.status === "draft" && !submission.submitted_at) throw new ApiError("conflict", "The author has not submitted this draft for review yet");
      }
      if (action === "approve") {
        audit.context = { review_hash: i.reviewHash };
        const client = await userClient();
        let result: unknown;
        try {
          // The two-argument overload refuses unless the version still has the hash the reviewer was shown.
          result = await rpc(client, "approve_shared_template_version", { p_version_id: i.id, p_expected_review_hash: i.reviewHash });
        } catch (error) {
          if (error instanceof ApiError && error.code === "conflict" && (error.details as { reload?: boolean } | undefined)?.reload) {
            throw new ApiError("conflict", REVIEW_CHANGED_MESSAGE, { reload: true, reason: "review_changed" });
          }
          throw error;
        }
        return { result, version: await loadVersion(db, i.id, caller.userId) };
      }
      const client = await userClient();
      const fn = action === "reject" ? "reject_shared_template_version" : "rollback_shared_template_version";
      const result = await rpc(client, fn, { p_version_id: i.id, p_reason: i.reason });
      return { result, version: await loadVersion(db, i.id, caller.userId) };
    },
  });

const reviewState = (action: "submit" | "withdraw") =>
  defineEndpoint({
    method: "POST",
    path: `/templates/versions/:id/${action}`,
    summary:
      action === "submit"
        ? "Submit your own open draft for review. Its content and sources are frozen until it is approved, rejected or withdrawn."
        : "Take your own draft back out of review so it can be revised again.",
    roles: OPERATORS,
    input: z.object({ id: uuid }),
    audit: { action: action === "submit" ? "templates.submitted" : "templates.withdrawn_from_review", table: "public.shared_template_versions" },
    async handler({ db, input, admin, audit }) {
      const current = await versionDetail(db, input.id);
      requireOwnDraft(current, await submissionOf(db, input.id), admin.userId, action === "submit" ? "submits" : "withdraws", action === "withdraw");
      const result =
        action === "submit"
          ? await rpc<{ review_hash?: string } | null>(db, "submit_shared_template_version", { p_version_id: input.id, p_actor: admin.userId })
          : await rpc<unknown>(db, "withdraw_shared_template_version", { p_version_id: input.id, p_actor: admin.userId });
      if (action === "submit") audit.context = { review_hash: (result as { review_hash?: string } | null)?.review_hash ?? null };
      return { result, version: await loadVersion(db, input.id, admin.userId) };
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
      if (error) throw fromDbError(error);
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
    summary: "One version with its sources, reviews, the diff against the published version, its review hash, and hints for you.",
    roles: ALL_ROLES,
    input: z.object({ id: uuid }),
    async handler({ db, input, caller }) {
      // The hash is read before the content: if the content changes in between, the reviewer is shown the newer
      // content with the older hash and approval is refused, never the reverse.
      const reviewHash = await rpc<string | null>(db, "shared_template_review_hash", { p_version_id: input.id });
      const detail = await versionDetail(db, input.id);
      const diff = await rpc(db, "shared_template_diff", { p_version_id: input.id });
      const submission = await submissionOf(db, input.id);
      return { ...withHints(detail, caller.userId, submission), diff, reviewHash: typeof reviewHash === "string" && REVIEW_HASH_RE.test(reviewHash) ? reviewHash : null };
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
      requireOwnDraft(current, await submissionOf(db, input.id), admin.userId, "revises", false);
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
      return loadVersion(db, input.id, admin.userId);
    },
  }),
  reviewState("submit"),
  reviewState("withdraw"),
  decision("approve"),
  decision("reject"),
  decision("rollback"),
];
