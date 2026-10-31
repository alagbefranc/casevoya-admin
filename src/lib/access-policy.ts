import "server-only";
import type { InviteConfig } from "./env";

/**
 * Keeps the Cloudflare Access allow policy of admin.casevoya.ca in step with the portal: its include list is exactly
 * the static owners (ADMIN_ALLOWED_EMAILS), every platform admin, and every open invite. Only single-email rules are
 * ever written. If the policy holds any other kind of rule (a domain, everyone, a group...) nothing is changed and
 * the call fails, so the portal can never widen access. The policy is read, changed and written back whole.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class AccessPolicyError extends Error {}

type Rule = Record<string, unknown>;
type Policy = { name: string; decision: string; include: Rule[]; exclude?: Rule[]; require?: Rule[]; precedence?: number; session_duration?: string; mfa_config?: unknown; [k: string]: unknown };

const EMAIL_RE = /^[^@\s,*]+@[^@\s,*]+\.[^@\s,*]+$/;

/** The email of a single-email include rule, or null for any other rule. */
export function ruleEmail(rule: Rule): string | null {
  const keys = Object.keys(rule);
  if (keys.length !== 1 || keys[0] !== "email") return null;
  const value = (rule.email as { email?: unknown } | null)?.email;
  return typeof value === "string" && EMAIL_RE.test(value) ? value.trim().toLowerCase() : null;
}

/** The include list for `emails` (deduplicated, lowercased, sorted). Refuses anything that is not one exact email. */
export function includeFor(emails: Iterable<string>): Rule[] {
  const set = new Set<string>();
  for (const raw of emails) {
    const email = String(raw).trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.startsWith("*") || email.startsWith("@")) throw new AccessPolicyError(`Refusing to add a non-email rule: ${email}`);
    set.add(email);
  }
  return [...set].sort().map((email) => ({ email: { email } }));
}

export type PolicyChange = { before: string[]; after: string[]; added: string[]; removed: string[]; changed: boolean };

export async function syncAccessPolicy(
  config: InviteConfig,
  desired: { keep: string[]; members: string[] },
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<PolicyChange> {
  if (!desired.keep.length) throw new AccessPolicyError("No static admin emails to keep; refusing to rewrite the Access policy");
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/access/apps/${config.accessAppId}/policies/${config.accessPolicyId}`;
  const headers = { authorization: `Bearer ${config.token}`, "content-type": "application/json" };
  const got = await fetchImpl(url, { method: "GET", headers });
  const body = (await got.json().catch(() => null)) as { success?: boolean; result?: Policy } | null;
  if (!got.ok || !body?.success || !body.result) throw new AccessPolicyError(`Could not read the Access policy (HTTP ${got.status})`);
  const policy = body.result;
  if (policy.decision !== "allow") throw new AccessPolicyError("The Access policy is not an allow policy");
  const current = policy.include ?? [];
  const before: string[] = [];
  for (const rule of current) {
    const email = ruleEmail(rule);
    if (!email) throw new AccessPolicyError("The Access policy has a rule that is not a single email; change it in Cloudflare first");
    before.push(email);
  }
  const include = includeFor([...desired.keep, ...desired.members]);
  const after = include.map((r) => (r.email as { email: string }).email);
  const beforeSorted = [...new Set(before)].sort();
  const added = after.filter((e) => !beforeSorted.includes(e));
  const removed = beforeSorted.filter((e) => !after.includes(e));
  if (!added.length && !removed.length) return { before: beforeSorted, after, added, removed, changed: false };
  const next: Record<string, unknown> = {
    name: policy.name,
    decision: policy.decision,
    include,
    exclude: policy.exclude ?? [],
    require: policy.require ?? [],
  };
  for (const key of ["precedence", "session_duration", "mfa_config", "approval_required", "isolation_required", "purpose_justification_required"]) {
    if (policy[key] !== undefined && policy[key] !== null && policy[key] !== "") next[key] = policy[key];
  }
  const put = await fetchImpl(url, { method: "PUT", headers, body: JSON.stringify(next) });
  const out = (await put.json().catch(() => null)) as { success?: boolean } | null;
  if (!put.ok || !out?.success) throw new AccessPolicyError(`Could not update the Access policy (HTTP ${put.status})`);
  return { before: beforeSorted, after, added, removed, changed: true };
}
