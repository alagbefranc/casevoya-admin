import { describe, expect, it } from "vitest";
import { handle } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { fromDbError } from "@/lib/api/errors";
import { REVIEW_CHANGED_MESSAGE } from "@/lib/api/modules/templates";
import { ApiFailure } from "@/client/api";
import { isReviewChanged, reviewActions } from "@/client/template-review";
import { ID, ME, OTHER, auditCalls, deps, fakeDb, req } from "./api-helpers";

/** ADM-03 review binding: submit / withdraw by the author, approval bound to the review hash the reviewer saw. */

const HASH = "0123456789abcdef".repeat(4);
const body = (res: Response) => res.json() as Promise<{ data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } }>;
const version = (status = "draft", author: string | null = OTHER, official = true) => ({
  version: { id: ID, template_id: ID, stable_key: "study_permit", status, author_user_id: author },
  sources: [{ official }],
  reviews: [],
});
const inReview = { status: "draft", submitted_at: "2026-10-30T12:00:00Z", submitted_by: OTHER };
const notSubmitted = { status: "draft", submitted_at: null, submitted_by: null };
const approve = (extra: Record<string, unknown> = {}) => req("POST", `/templates/versions/${ID}/approve`, { confirmCompared: true, reviewHash: HASH, ...extra });
const reviseBody = { title: "T", items: ["a"], testEvidence: "evidence ok", effectiveOn: "2026-11-01", changelog: "chg", sources: [{ url: "https://www.canada.ca/x" }] };

describe("GET /templates/versions/:id review hash", () => {
  it("returns the review hash, read before the content it describes, and the submission state", async () => {
    const d = deps({ role: "viewer", db: fakeDb({ shared_template_review_hash: HASH, platform_template_version: version(), shared_template_diff: { before: null } }, { shared_template_versions: [inReview] }) });
    const res = await handle(req("GET", `/templates/versions/${ID}`), ENDPOINTS, d);
    expect(res.status).toBe(200);
    const data = (await body(res)).data!;
    expect(data.reviewHash).toBe(HASH);
    expect(data.hints).toMatchObject({ inReview: true, submittedAt: inReview.submitted_at, isAuthor: false });
    const order = d.db.calls.map((c) => c.fn);
    expect(order.indexOf("shared_template_review_hash")).toBeLessThan(order.indexOf("platform_template_version"));
    expect(d.db.calls.find((c) => c.fn === "shared_template_review_hash")?.args).toEqual({ p_version_id: ID });
  });
  it("reports a draft that is not submitted and drops a malformed hash", async () => {
    const d = deps({ db: fakeDb({ shared_template_review_hash: "nope", platform_template_version: version() }, { shared_template_versions: [notSubmitted] }) });
    const data = (await body(await handle(req("GET", `/templates/versions/${ID}`), ENDPOINTS, d))).data!;
    expect(data.reviewHash).toBeNull();
    expect(data.hints).toMatchObject({ inReview: false, submittedAt: null });
  });
});

describe("POST /templates/versions/:id/approve", () => {
  const approveDeps = (opts: { userRpcs?: Record<string, unknown>; row?: Record<string, unknown> | null } = {}) =>
    deps({
      role: "operator",
      session: "fresh",
      templateReviewer: true,
      db: fakeDb({ platform_template_version: version("published") }, { shared_template_versions: opts.row === null ? [] : [opts.row ?? inReview] }),
      userDb: fakeDb(opts.userRpcs ?? { approve_shared_template_version: { id: ID, status: "published" } }),
    });

  it("calls the hash-bound overload in the reviewer's own session", async () => {
    const d = approveDeps();
    const res = await handle(approve({ reviewHash: HASH.toUpperCase() }), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.userDb.calls).toEqual([{ fn: "approve_shared_template_version", args: { p_version_id: ID, p_expected_review_hash: HASH } }]);
    expect(d.db.calls.map((c) => c.fn)).not.toContain("approve_shared_template_version");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "success", p_action: "admin_portal.templates.approve", p_context: expect.objectContaining({ review_hash: HASH }) });
  });

  it("refuses without the review hash and never calls the database", async () => {
    for (const reviewHash of [undefined, "", "abc", "g".repeat(64)]) {
      const d = approveDeps();
      const res = await handle(req("POST", `/templates/versions/${ID}/approve`, { confirmCompared: true, ...(reviewHash === undefined ? {} : { reviewHash }) }), ENDPOINTS, d);
      expect(res.status).toBe(422);
      expect(d.userDb.calls).toEqual([]);
    }
  });

  it("refuses a draft that was not submitted for review before asking the reviewer session", async () => {
    const d = approveDeps({ row: notSubmitted });
    const res = await handle(approve(), ENDPOINTS, d);
    expect(res.status).toBe(409);
    expect((await body(res)).error?.message).toMatch(/not submitted/);
    expect(d.userDb.calls).toEqual([]);
    expect(d.sessionCalls).toEqual([]);
  });

  it("404s an unknown version", async () => {
    const d = approveDeps({ row: null });
    expect((await handle(approve(), ENDPOINTS, d)).status).toBe(404);
    expect(d.userDb.calls).toEqual([]);
  });

  it("explains that the content changed when the database refuses the hash", async () => {
    const d = approveDeps({ userRpcs: { approve_shared_template_version: { error: { code: "PT409", message: "the version changed since it was reviewed; reload it" } } } });
    const res = await handle(approve(), ENDPOINTS, d);
    expect(res.status).toBe(409);
    const err = (await body(res)).error!;
    expect(err.code).toBe("conflict");
    expect(err.message).toBe(REVIEW_CHANGED_MESSAGE);
    expect(err.details).toMatchObject({ reload: true, reason: "review_changed" });
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_result: "failure" });
  });

  it("passes other database refusals through unchanged", async () => {
    const d = approveDeps({ userRpcs: { approve_shared_template_version: { error: { code: "42501", message: "the author cannot approve their own version" } } } });
    const res = await handle(approve(), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect((await body(res)).error?.message).toMatch(/author/);
  });

  it("still needs the reviewer flag", async () => {
    const d = deps({ role: "operator", session: "fresh", templateReviewer: false, db: fakeDb({}, { shared_template_versions: [inReview] }) });
    expect((await handle(approve(), ENDPOINTS, d)).status).toBe(403);
    expect(d.userDb.calls).toEqual([]);
  });
});

describe("submit and withdraw", () => {
  const authorDb = (row: Record<string, unknown> | null, author: string = ME, official = true, rpcs: Record<string, unknown> = {}) =>
    fakeDb({ platform_template_version: version("draft", author, official), submit_shared_template_version: { id: ID, review_hash: HASH }, ...rpcs }, { shared_template_versions: row ? [row] : [] });
  const post = (action: "submit" | "withdraw") => req("POST", `/templates/versions/${ID}/${action}`, {});

  it("lets the author submit as the service role naming themselves", async () => {
    const d = deps({ role: "operator", db: authorDb(notSubmitted) });
    const res = await handle(post("submit"), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(d.db.calls.find((c) => c.fn === "submit_shared_template_version")?.args).toEqual({ p_version_id: ID, p_actor: ME });
    expect(d.userDb.calls).toEqual([]);
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.templates.submitted", p_result: "success", p_object_id: ID });
  });

  it("refuses submit by someone other than the author", async () => {
    const d = deps({ role: "owner", db: authorDb(notSubmitted, OTHER) });
    const res = await handle(post("submit"), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect(d.db.calls.map((c) => c.fn)).not.toContain("submit_shared_template_version");
  });

  it("refuses submitting twice and refuses a viewer", async () => {
    const twice = deps({ role: "operator", db: authorDb({ ...inReview, submitted_by: ME }) });
    expect((await handle(post("submit"), ENDPOINTS, twice)).status).toBe(409);
    expect(twice.db.calls.map((c) => c.fn)).not.toContain("submit_shared_template_version");
    const viewer = deps({ role: "viewer", db: authorDb(notSubmitted) });
    expect((await handle(post("submit"), ENDPOINTS, viewer)).status).toBe(403);
  });

  it("passes the database's official-source refusal through", async () => {
    const d = deps({ role: "operator", db: authorDb(notSubmitted, ME, false, { submit_shared_template_version: { error: { code: "22023", message: "list at least one official source before submitting" } } }) });
    const res = await handle(post("submit"), ENDPOINTS, d);
    expect(res.status).toBe(422);
    expect((await body(res)).error?.message).toMatch(/official source/);
  });

  it("lets the author withdraw a draft in review, and only then", async () => {
    const d = deps({ role: "operator", db: authorDb({ ...inReview, submitted_by: ME }) });
    expect((await handle(post("withdraw"), ENDPOINTS, d)).status).toBe(200);
    expect(d.db.calls.find((c) => c.fn === "withdraw_shared_template_version")?.args).toEqual({ p_version_id: ID, p_actor: ME });
    const open = deps({ role: "operator", db: authorDb(notSubmitted) });
    expect((await handle(post("withdraw"), ENDPOINTS, open)).status).toBe(409);
    expect(open.db.calls.map((c) => c.fn)).not.toContain("withdraw_shared_template_version");
    const other = deps({ role: "operator", db: authorDb(inReview, OTHER) });
    expect((await handle(post("withdraw"), ENDPOINTS, other)).status).toBe(403);
  });

  it("refuses to revise a draft that is in review", async () => {
    const d = deps({ role: "operator", db: authorDb({ ...inReview, submitted_by: ME }) });
    const res = await handle(req("PATCH", `/templates/versions/${ID}`, reviseBody), ENDPOINTS, d);
    expect(res.status).toBe(409);
    expect((await body(res)).error?.message).toMatch(/Withdraw it from review/);
    const fns = d.db.calls.map((c) => c.fn);
    expect(fns).not.toContain("revise_shared_template_draft");
    expect(fns).not.toContain("set_shared_template_version_sources");
  });

  it("still revises an open draft that is not submitted", async () => {
    const d = deps({ role: "operator", db: authorDb(notSubmitted) });
    expect((await handle(req("PATCH", `/templates/versions/${ID}`, reviseBody), ENDPOINTS, d)).status).toBe(200);
    expect(d.db.calls.map((c) => c.fn)).toContain("revise_shared_template_draft");
  });
});

describe("fromDbError", () => {
  it("maps PostgREST's PT409 to a conflict that asks for a reload", () => {
    const e = fromDbError({ code: "PT409", message: "the version changed since it was reviewed; reload it" });
    expect(e.code).toBe("conflict");
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ reload: true });
    expect(fromDbError({ code: "23505", message: "dup" }).details).toBeUndefined();
  });
});

describe("version page actions", () => {
  const author = { operate: true, reviewTemplates: false };
  const reviewer = { operate: true, reviewTemplates: true };
  const viewer = { operate: false, reviewTemplates: false };
  const base = { status: "draft", isAuthor: false, inReview: false, hasOfficialSource: true, reviewHash: HASH };

  it("lets the author submit, revise and then withdraw, never approve", () => {
    const open = reviewActions({ ...base, isAuthor: true }, { ...author, reviewTemplates: true });
    expect(open).toMatchObject({ stage: "draft", canSubmit: true, canRevise: true, canWithdraw: false, canApprove: false, canReject: false, submitBlocked: null });
    const submitted = reviewActions({ ...base, isAuthor: true, inReview: true }, author);
    expect(submitted).toMatchObject({ stage: "in_review", canSubmit: false, canRevise: false, canWithdraw: true, canApprove: false });
    expect(reviewActions({ ...base, isAuthor: true, hasOfficialSource: false }, author).submitBlocked).toMatch(/official source/);
  });

  it("shows approve to a reviewer only once the draft is submitted", () => {
    expect(reviewActions(base, reviewer)).toMatchObject({ canApprove: false, canReject: true, canSubmit: false });
    expect(reviewActions({ ...base, inReview: true }, reviewer)).toMatchObject({ canApprove: true, canReject: true, approveBlocked: null });
  });

  it("blocks approve without the review hash or an official source", () => {
    expect(reviewActions({ ...base, inReview: true, reviewHash: null }, reviewer).approveBlocked).toMatch(/Reload/);
    expect(reviewActions({ ...base, inReview: true, hasOfficialSource: false }, reviewer).approveBlocked).toMatch(/official source/);
  });

  it("offers nothing to a viewer or on a closed version", () => {
    const none = { canSubmit: false, canWithdraw: false, canRevise: false, canApprove: false, canReject: false };
    expect(reviewActions({ ...base, isAuthor: true, inReview: true }, viewer)).toMatchObject(none);
    expect(reviewActions({ ...base, status: "published", inReview: true }, reviewer)).toMatchObject({ ...none, stage: "published" });
  });

  it("recognises the content-changed refusal", () => {
    expect(isReviewChanged(new ApiFailure("conflict", REVIEW_CHANGED_MESSAGE, 409, "r", { reload: true, reason: "review_changed" }))).toBe(true);
    expect(isReviewChanged(new ApiFailure("conflict", "A draft of this template is already open", 409, "r"))).toBe(false);
    expect(isReviewChanged(new Error("x"))).toBe(false);
  });
});
