import type { Overview, SessionStatus } from "./types";

/** Fresh-MFA rule (spec 1.6): ask for the code inside the confirm dialog when under 60 s of freshness is left. */
export type StepUpNeed = "none" | "code" | "sign-in";
export function stepUpNeed(session: SessionStatus | null | undefined, nowSeconds: number): StepUpNeed {
  if (!session?.signedIn || !session.matchesAccessUser) return "sign-in";
  if (session.stepUpFreshUntil === null || session.stepUpFreshUntil - nowSeconds < 60) return "code";
  return "none";
}

/** The session chip (spec 1.6 table). */
export function chipState(session: SessionStatus | null | undefined, nowSeconds: number): { tone: "neutral" | "ok" | "info" | "warn"; label: string; short: string } {
  if (!session?.signedIn) return { tone: "neutral", label: "Not signed in", short: "Not signed in" };
  if (!session.matchesAccessUser) return { tone: "warn", label: "Session mismatch", short: "Mismatch" };
  const left = session.stepUpFreshUntil === null ? 0 : session.stepUpFreshUntil - nowSeconds;
  if (left > 0) {
    const mins = Math.max(1, Math.ceil(left / 60));
    return { tone: "ok", label: `Verified · ${mins} min`, short: `${mins} min` };
  }
  return { tone: "info", label: "Signed in", short: "Signed in" };
}

/** Attention counts next to nav items (spec 1.5). Text, never colour alone. */
export type NavCount = { text: string; tone: "w" | "b" | "ok" | "" };
export function navCounts(o: Overview | null | undefined): Record<string, NavCount | undefined> {
  if (!o) return {};
  const out: Record<string, NavCount | undefined> = {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const ex = n(o.subscriptions?.exceptions);
  if (ex) out.subscriptions = { text: `${ex} ${ex === 1 ? "exception" : "exceptions"}`, tone: "w" };
  const ver = n(o.licences?.due) + n(o.licences?.adverse) + n(o.licences?.needs_review);
  if (ver) out.verification = { text: `${ver} to check`, tone: n(o.licences?.adverse) ? "b" : "w" };
  const pend = n(o.support?.pending);
  if (pend) out.grants = { text: `${pend} pending`, tone: "" };
  const level = o.queues?.level;
  if (level === "unhealthy") out.health = { text: "Unhealthy", tone: "b" };
  else if (level === "degraded") out.health = { text: "Degraded", tone: "w" };
  const inc = n(o.incidents?.active);
  if (inc) out.incidents = { text: `${inc} active`, tone: o.incidents?.status === "major_incident" ? "b" : "w" };
  const rev = n(o.templates?.awaiting_review);
  if (rev) out.releases = { text: `${rev} to review`, tone: "w" };
  return out;
}

/** Verification workload (spec 2.1 card table). */
export function verificationWorkload(o: Overview): number {
  return (o.licences?.due ?? 0) + (o.licences?.adverse ?? 0) + (o.licences?.needs_review ?? 0) + (o.verification_workload?.firms_pending_review ?? 0);
}

/** Maps validation issues to fields; anything unmatched goes to the form's summary (spec 1.1). */
export function splitIssues(issues: { path: string; message: string }[], fields: string[]): { byField: Record<string, string>; summary: string[] } {
  const byField: Record<string, string> = {};
  const summary: string[] = [];
  for (const issue of issues) {
    const match = fields.find((f) => issue.path === f || issue.path.startsWith(`${f}.`));
    if (match && !byField[match]) byField[match] = issue.message;
    else summary.push(issue.message);
  }
  return { byField, summary };
}
