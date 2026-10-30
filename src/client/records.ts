/** Pure helpers for the Audit, Privacy, Sample mode and Migration pages (spec 2.9, 2.10, 2.13, 2.14). */

export const AUDIT_FAMILIES = [
  "admin_portal.", "platform_admin", "support_access.", "service_notice.", "template.", "outbox.", "licence.", "cicc.", "subscription.", "security.",
] as const;

export const ACTION_PREFIX = /^[a-z_][a-z0-9_.]{0,80}$/;

/** datetime-local value (viewer's zone) → ISO, or null when empty/invalid. */
export function localToIso(v: string): string | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Client mirror of the API rule: From must not be after To. */
export function rangeError(from: string | null, to: string | null): string | null {
  if (from && to && Date.parse(from) > Date.parse(to)) return "From is before To";
  return null;
}

export const PRIVACY_STAGES = ["received", "identity_verified", "scoped", "redacted", "reviewed", "closed"] as const;

/** 1-based position of a privacy request stage (0 when unknown). */
export function stageIndex(stage: string | null | undefined): number {
  return PRIVACY_STAGES.indexOf((stage ?? "") as (typeof PRIVACY_STAGES)[number]) + 1;
}

/** Days-left tone: red when negative, amber when within the due-soon window (spec 2.10). */
export function daysLeftTone(days: number | null | undefined, closed: boolean, soon = 5): "bad" | "warn" | null {
  if (closed || days === null || days === undefined) return null;
  if (days < 0) return "bad";
  if (days <= soon) return "warn";
  return null;
}

export function daysLeftText(days: number | null | undefined, closed: boolean): string {
  if (closed || days === null || days === undefined) return "—";
  if (days < 0) return `${-days} overdue`;
  if (days === 0) return "Due today";
  return String(days);
}

export const MIGRATION_STATUSES = ["staged", "checked", "committing", "committed", "rolled_back", "discarded", "stuck"] as const;

/** A stuck job shows Stuck (red) over its stored status. */
export function migrationStatus(job: { status: string; stuck: boolean }): { label: string; tone: "bad" | "info" | "ok" | "warn" | "neutral" } {
  if (job.stuck) return { label: "Stuck", tone: "bad" };
  const tone = ({ staged: "neutral", checked: "info", committing: "warn", committed: "ok", rolled_back: "warn", discarded: "neutral" } as const)[job.status as "staged"] ?? "neutral";
  const label = job.status.replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tone };
}

/** Counts object → sorted [key, value] pairs, skipping non-numbers. */
export function countPairs(v: unknown): [string, number][] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === "number").sort((a, b) => a[0].localeCompare(b[0]));
}

/** Source system for display: acronyms upper-cased, others title-cased. */
export function sourceLabel(v: string | null | undefined): string {
  if (!v) return "—";
  if (/^(csv|xlsx|json|xml)$/i.test(v)) return v.toUpperCase();
  return v.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
