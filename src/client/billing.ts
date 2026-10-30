import { day } from "@/client/format";

export type SubscriptionException = {
  organization_id: string; firm_name: string; sample_mode: boolean; status: string | null; plan: string | null; billing_interval: string | null;
  reasons: string[]; trial_ends_at: string | null; current_period_end: string | null; cancel_at: string | null; past_due_since: string | null;
  restricted_at: string | null; latest_invoice_status: string | null; stripe_customer_id: string | null; updated_at: string | null;
};

/** The most relevant date for an exception row (spec 2.3): restriction, then past due, then trial, then cancellation, then renewal. */
export function keyDate(r: Pick<SubscriptionException, "reasons" | "restricted_at" | "past_due_since" | "trial_ends_at" | "cancel_at" | "current_period_end">): string | null {
  const has = (x: string) => r.reasons.includes(x);
  if (has("restricted") && r.restricted_at) return `Restricted since ${day(r.restricted_at)}`;
  if ((has("past_due") || has("invoice_unpaid")) && r.past_due_since) return `Due since ${day(r.past_due_since)}`;
  if (has("trial_ending") && r.trial_ends_at) return `Trial ends ${day(r.trial_ends_at)}`;
  if (has("trial_ended") && r.trial_ends_at) return `Trial ended ${day(r.trial_ends_at)}`;
  if (has("cancel_scheduled") && r.cancel_at) return `Cancels ${day(r.cancel_at)}`;
  if (r.current_period_end) return `Renews ${day(r.current_period_end)}`;
  return null;
}

export type UsageFlag = "near" | "over" | null;
/** Meter colour for one metric from the row's flags (spec 2.4). */
export function usageFlag(flags: string[], metric: "seats" | "matters" | "storage"): UsageFlag {
  if (flags.includes(`${metric}_over`)) return "over";
  if (flags.includes(`${metric}_near`)) return "near";
  return null;
}

/** Muted text for a null limit: enterprise has none, trials have no plan limit yet. */
export function noLimitText(plan: string | null, status: string | null): string {
  if (plan === "enterprise") return "No limit";
  if (!plan || status === "trial" || status === "trial_ended" || status === "trialing") return "Trial: no plan limit";
  return "No limit";
}

export function pct(used: number, limit: number | null): number | null {
  if (!limit) return null;
  return Math.round((used / limit) * 100);
}
