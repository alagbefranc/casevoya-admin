import { ApiFailure } from "./api";

/**
 * Which actions the shared-template version page offers (ADM-03 review binding). Pure, so it is unit-tested.
 * The API and the database re-check every rule; this only decides what is shown.
 *
 * - The author (operator/owner) revises an open draft, submits it for review, or withdraws it from review.
 * - A flagged reviewer who is not the author approves (bound to its review hash) or rejects a submitted draft.
 */
export type ReviewView = {
  status: string;
  isAuthor: boolean;
  inReview: boolean;
  hasOfficialSource: boolean;
  reviewHash: string | null;
};

export type ReviewActions = {
  /** "in_review" for a submitted draft, "draft" for one still being written, else the version status. */
  stage: string;
  canRevise: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  canReject: boolean;
  canApprove: boolean;
  /** Why Approve is shown but disabled (null when it can be pressed). */
  approveBlocked: string | null;
  /** Why Submit is shown but disabled. */
  submitBlocked: string | null;
};

export function reviewActions(v: ReviewView, me: { operate: boolean; reviewTemplates: boolean }): ReviewActions {
  const draft = v.status === "draft";
  const author = draft && v.isAuthor && me.operate;
  const reviewer = draft && !v.isAuthor && me.reviewTemplates;
  return {
    stage: draft ? (v.inReview ? "in_review" : "draft") : v.status,
    canRevise: author && !v.inReview,
    canSubmit: author && !v.inReview,
    canWithdraw: author && v.inReview,
    canReject: reviewer && v.inReview,
    canApprove: reviewer && v.inReview,
    approveBlocked: !v.hasOfficialSource ? "Add at least one official source" : !v.reviewHash ? "Reload the page to load what you are reviewing" : null,
    submitBlocked: !v.hasOfficialSource ? "Add at least one official source before submitting" : null,
  };
}

/** The approval was refused because the draft no longer matches what the reviewer was shown. */
export function isReviewChanged(error: unknown): boolean {
  return error instanceof ApiFailure && error.code === "conflict" && Boolean(error.details && (error.details as { reload?: unknown }).reload);
}
