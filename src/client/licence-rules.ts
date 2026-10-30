/** Pure licence rules shared by the verification pages (spec 2.11). */

export type CheckFlags = { registerStatus: "active" | "inactive" | ""; entitledToPractise: boolean; disciplineSuspended: boolean; disciplineRevoked: boolean; disciplineRestricted: boolean };

/** Result the database will record, in its order: revoked > suspended > inactive > not entitled > verified. */
export function previewResult(f: CheckFlags): "revoked" | "suspended" | "inactive" | "not_entitled" | "verified" | null {
  if (!f.registerStatus) return null;
  if (f.disciplineRevoked) return "revoked";
  if (f.disciplineSuspended) return "suspended";
  if (f.registerStatus === "inactive") return "inactive";
  if (!f.entitledToPractise) return "not_entitled";
  return "verified";
}

export const REGISTER_HOST = "register.college-ic.ca";
export function isRegisterUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && u.hostname === REGISTER_HOST;
  } catch {
    return false;
  }
}

export const QUEUE_KINDS = ["adverse", "needs_review", "never_checked", "overdue", "due", "all"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const CSV_MAX_BYTES = 8_000_000;
