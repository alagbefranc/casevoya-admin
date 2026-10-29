"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { officialDomains, reviewerLicence, templateVersionDetail } from "@/lib/data";
import { firstIssue, text, uuid } from "@/lib/forms";
import { ReviewerError, asReviewer, signInReviewer, signOutReviewer } from "@/lib/reviewer";
import { BLOCKER_TEXT, composeEvidence, draftSchema, lines, reasonSchema, reviewBlockers, sourcesForDb, totpSchema, type ReviewBlocker } from "@/lib/templates";

function back(path: string, kind: "ok" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message.slice(0, 280))}`);
}

function message(error: unknown, fallback: string): string {
  return error instanceof ReviewerError ? error.message : fallback;
}

/** New draft version, written by the service role with you as the author (draft_shared_template_version). */
export async function createDraft(form: FormData) {
  const admin = await requireAdmin();
  const domains = await officialDomains(admin);
  const parsed = draftSchema(domains).safeParse({
    stableKey: text(form, "stableKey") ?? "",
    title: text(form, "title") ?? "",
    summary: text(form, "summary") ?? "",
    items: lines(text(form, "items")),
    authorName: text(form, "authorName") ?? "",
    evidence: text(form, "evidence") ?? "",
    sources: lines(text(form, "sources")),
    effectiveOn: text(form, "effectiveOn") ?? "",
    changelog: text(form, "changelog") ?? "",
  });
  if (!parsed.success) back("/templates", "error", firstIssue(parsed.error));
  const v = parsed.data;
  const { data, error } = await admin.db.rpc("draft_shared_template_version", {
    p_stable_key: v.stableKey,
    p_title: v.title,
    p_summary: v.summary,
    p_items: v.items,
    p_author_name: v.authorName,
    p_author_user_id: admin.userId,
    p_test_evidence: composeEvidence(v.evidence, v.sources),
    p_effective_on: v.effectiveOn,
    p_changelog: v.changelog,
  });
  if (error) back("/templates", "error", error.message);
  const sources = await admin.db.rpc("set_shared_template_version_sources", {
    p_version_id: String(data),
    p_sources: sourcesForDb(v.sources.map((url) => ({ url }))),
    p_actor: admin.userId,
  });
  if (sources.error) back(`/templates/${String(data)}`, "error", `Draft saved, but its sources were not: ${sources.error.message}`);
  revalidatePath("/templates");
  redirect(`/templates/${String(data)}?ok=${encodeURIComponent("Draft saved. It waits for the licensed reviewer.")}`);
}

/** Revise an open draft (revise_shared_template_draft). Only the draft's author revises it. */
export async function reviseDraft(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.safeParse(text(form, "id"));
  if (!id.success) back("/templates", "error", "Unknown version");
  const path = `/templates/${id.data}`;
  const detail = await templateVersionDetail(admin, id.data);
  if (!detail || detail.version.status !== "draft") back(path, "error", "That draft is not open.");
  if (detail.version.authorUserId !== admin.userId) back(path, "error", "Only the draft's author revises it.");
  const domains = await officialDomains(admin);
  const parsed = draftSchema(domains).safeParse({
    stableKey: detail.version.stableKey,
    title: text(form, "title") ?? "",
    summary: text(form, "summary") ?? "",
    items: lines(text(form, "items")),
    authorName: detail.version.authorName,
    evidence: text(form, "evidence") ?? "",
    sources: lines(text(form, "sources")),
    effectiveOn: text(form, "effectiveOn") ?? "",
    changelog: text(form, "changelog") ?? "",
  });
  if (!parsed.success) back(path, "error", firstIssue(parsed.error));
  const v = parsed.data;
  const { error } = await admin.db.rpc("revise_shared_template_draft", {
    p_version_id: id.data,
    p_title: v.title,
    p_summary: v.summary,
    p_items: v.items,
    p_test_evidence: composeEvidence(v.evidence, v.sources),
    p_effective_on: v.effectiveOn,
    p_changelog: v.changelog,
  });
  if (error) back(path, "error", error.message);
  const sources = await admin.db.rpc("set_shared_template_version_sources", {
    p_version_id: id.data,
    p_sources: sourcesForDb(v.sources.map((url) => ({ url }))),
    p_actor: admin.userId,
  });
  if (sources.error) back(path, "error", `Draft revised, but its sources were not: ${sources.error.message}`);
  revalidatePath(path);
  back(path, "ok", "Draft revised.");
}

/** Reviewer sign-in: your own Casevoya password and authenticator code. */
export async function reviewerSignIn(form: FormData) {
  const admin = await requireAdmin();
  const next = uuid.safeParse(text(form, "next")).success ? `/templates/${text(form, "next")}` : "/templates";
  if (!admin.templateReviewer) back(next, "error", BLOCKER_TEXT.not_flagged);
  const password = form.get("password");
  const code = totpSchema.safeParse(text(form, "code"));
  if (typeof password !== "string" || !password) back(next, "error", "Enter your password.");
  if (!code.success) back(next, "error", firstIssue(code.error));
  try {
    await signInReviewer(admin, password, code.data);
  } catch (error) {
    back(next, "error", message(error, "Reviewer sign-in failed."));
  }
  back(next, "ok", "Signed in as the reviewer for up to an hour. Each decision still asks for a fresh code.");
}

export async function reviewerSignOut(form: FormData) {
  const admin = await requireAdmin();
  await signOutReviewer(admin);
  const next = uuid.safeParse(text(form, "next")).success ? `/templates/${text(form, "next")}` : "/templates";
  back(next, "ok", "Reviewer session ended.");
}

/** Shared checks for approve and reject; returns the version id and the code, or redirects with the reason. */
async function decide(form: FormData, extra: (path: string) => void) {
  const admin = await requireAdmin();
  const id = uuid.safeParse(text(form, "id"));
  if (!id.success) back("/templates", "error", "Unknown version");
  const path = `/templates/${id.data}`;
  const detail = await templateVersionDetail(admin, id.data);
  if (!detail) back(path, "error", "Unknown version");
  const licence = await reviewerLicence(admin, admin.userId);
  const blockers = reviewBlockers({
    userId: admin.userId,
    templateReviewer: admin.templateReviewer,
    hasPublishableKey: Boolean(admin.env.supabasePublishableKey),
    version: detail.version,
    licensed: Boolean(licence),
    sessionUserId: admin.userId, // the session itself is checked against the Access user inside asReviewer
  }).filter((b): b is ReviewBlocker => b !== "no_session");
  if (blockers.length) back(path, "error", BLOCKER_TEXT[blockers[0]]);
  const code = totpSchema.safeParse(text(form, "code"));
  if (!code.success) back(path, "error", firstIssue(code.error));
  extra(path);
  return { admin, id: id.data, path, code: code.data };
}

/** Approve = publish. Runs approve_shared_template_version in the reviewer's own session after a fresh step-up. */
export async function approveVersion(form: FormData) {
  await requireAdmin();
  const { admin, id, path, code } = await decide(form, (p) => {
    if (text(form, "confirm") !== "yes") back(p, "error", "Tick the box to confirm you compared the draft with the official sources.");
  });
  let result: { error: { message: string } | null };
  try {
    result = await asReviewer(admin, code, async (client) => client.rpc("approve_shared_template_version", { p_version_id: id }));
  } catch (error) {
    back(path, "error", message(error, "Approval failed."));
  }
  if (result.error) back(path, "error", result.error.message);
  revalidatePath("/templates");
  revalidatePath(path);
  back(path, "ok", "Approved and published. Every firm gets a notice; firms that adopted the old version keep it until they adopt this one.");
}

/** Reject with a reason (reject_shared_template_version), in the reviewer's own session. */
export async function rejectVersion(form: FormData) {
  await requireAdmin();
  const reason = reasonSchema.safeParse(text(form, "reason") ?? "");
  const { admin, id, path, code } = await decide(form, (p) => {
    if (!reason.success) back(p, "error", firstIssue(reason.error));
  });
  if (!reason.success) back(path, "error", "Give a reason of 3 to 500 characters");
  let result: { error: { message: string } | null };
  try {
    result = await asReviewer(admin, code, async (client) => client.rpc("reject_shared_template_version", { p_version_id: id, p_reason: reason.data }));
  } catch (error) {
    back(path, "error", message(error, "Rejection failed."));
  }
  if (result.error) back(path, "error", result.error.message);
  revalidatePath("/templates");
  revalidatePath(path);
  back(path, "ok", "Rejected. The author can start a new draft.");
}
