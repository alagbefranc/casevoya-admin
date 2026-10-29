import { z } from "zod";

/**
 * Pure helpers for the shared-template release screens (ADM-03). No I/O, so they are unit-tested.
 *
 * The database (main repo, migration 20261029130100_adm_shared_templates) is the authority:
 * - drafts and revisions are written by the service role (draft_/revise_shared_template_draft);
 * - approve (= publish) and reject run in the reviewer's OWN Supabase session with a fresh TOTP step-up,
 *   and app.platform_template_reviewer() refuses the service role, non-platform-admins, anyone without an
 *   active licence, and (approve) the draft's author.
 * The portal adds its own checks on top so a refusal is explained before anyone types a code.
 */

export const SOURCES_HEADER = "Official sources:";

/** Hosts on public.official_source_domains (all match_kind = suffix today). */
export type OfficialDomain = { host: string; matchKind: string; authority: string };

export type Citation = { url: string; host: string; official: boolean; authority: string | null };

const URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+/gi;

export function hostMatches(host: string, domain: OfficialDomain): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const d = domain.host.toLowerCase();
  if (domain.matchKind === "exact") return h === d;
  return h === d || h.endsWith(`.${d}`);
}

/** Every distinct URL in the given texts, marked official when its host is on the official-source allow list. */
export function extractCitations(texts: (string | null | undefined)[], domains: OfficialDomain[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const text of texts) {
    for (const match of (text ?? "").matchAll(URL_RE)) {
      const url = match[0].replace(/[.,;:]+$/, "");
      if (seen.has(url)) continue;
      seen.add(url);
      let host: string;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
        host = parsed.hostname;
      } catch {
        continue;
      }
      const domain = url.startsWith("https://") ? domains.find((d) => hostMatches(host, d)) : undefined;
      out.push({ url, host, official: Boolean(domain), authority: domain?.authority ?? null });
    }
  }
  return out;
}

/** Splits a textarea into trimmed, non-empty lines. */
export function lines(value: string | null | undefined): string[] {
  return (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * The shared-template body has no citations field yet (see docs/MAIN-APP-CHANGES.md), so the portal records the
 * official sources inside the version's test evidence under a fixed header. The reviewer sees them parsed back out.
 */
export function composeEvidence(evidence: string, sources: string[]): string {
  const body = evidence.trim();
  if (!sources.length) return body;
  return `${body}\n\n${SOURCES_HEADER}\n${sources.join("\n")}`;
}

/** Splits test evidence written by composeEvidence back into its two parts. */
export function splitEvidence(stored: string): { evidence: string; sources: string[] } {
  const at = stored.lastIndexOf(`\n${SOURCES_HEADER}\n`);
  if (at < 0) return { evidence: stored.trim(), sources: [] };
  return { evidence: stored.slice(0, at).trim(), sources: lines(stored.slice(at + SOURCES_HEADER.length + 2)) };
}

const officialUrl = (domains: OfficialDomain[]) =>
  z
    .string()
    .url("Each source is a full https:// URL")
    .refine((url) => url.startsWith("https://"), "Each source is a full https:// URL")
    .refine((url) => {
      try {
        const host = new URL(url).hostname;
        return domains.some((d) => hostMatches(host, d));
      } catch {
        return false;
      }
    }, "Each source must be on the official-source allow list (canada.ca, justice.gc.ca, a province …)");

export function draftSchema(domains: OfficialDomain[]) {
  return z
    .object({
      stableKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,60}$/, "The template key is lowercase words joined by _ (2 to 61 characters)"),
      title: z.string().trim().min(1, "The title is 1 to 160 characters").max(160, "The title is 1 to 160 characters"),
      summary: z.string().trim().max(2000, "The summary is at most 2000 characters"),
      items: z
        .array(z.string().max(200, "Each item is at most 200 characters"))
        .min(1, "Add at least one item")
        .max(80, "A template has at most 80 items"),
      authorName: z.string().trim().min(1, "Name the author").max(120, "The author name is at most 120 characters"),
      evidence: z.string().trim().min(8, "Describe the test evidence (8 characters or more)"),
      sources: z.array(officialUrl(domains)).min(1, "Cite at least one official source").max(20, "Cite at most 20 sources"),
      effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the effective date"),
      changelog: z.string().trim().min(3, "The changelog is 3 to 2000 characters").max(2000, "The changelog is 3 to 2000 characters"),
    })
    .superRefine((v, ctx) => {
      if (composeEvidence(v.evidence, v.sources).length > 2000) {
        ctx.addIssue({ code: "custom", message: "Test evidence plus sources must fit in 2000 characters" });
      }
    });
}

export const reasonSchema = z.string().trim().min(3, "Give a reason of 3 to 500 characters").max(500, "Give a reason of 3 to 500 characters");
export const totpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export type ReviewBlocker =
  | "not_flagged"
  | "no_publishable_key"
  | "is_author"
  | "not_draft"
  | "no_licence"
  | "no_session"
  | "session_mismatch";

export const BLOCKER_TEXT: Record<ReviewBlocker, string> = {
  not_flagged: "You are not flagged as the licensed template reviewer (TEMPLATE_REVIEWER_EMAILS).",
  no_publishable_key: "The Worker has no SUPABASE_PUBLISHABLE_KEY, so a reviewer cannot sign in.",
  is_author: "You wrote this draft. The author can never approve their own version.",
  not_draft: "This version is not waiting for review.",
  no_licence: "No active, verified licence is on file for you (consultant credential with register status active). The database will refuse.",
  no_session: "Sign in as the reviewer (password + authenticator code) before approving or rejecting.",
  session_mismatch: "The reviewer session belongs to a different user than your Access sign-in.",
};

/** Why this admin cannot approve/reject this version right now. Empty means the buttons are shown. */
export function reviewBlockers(input: {
  email: string;
  userId: string;
  reviewerEmails: string[];
  hasPublishableKey: boolean;
  version: { status: string; authorUserId: string | null };
  licensed: boolean;
  sessionUserId: string | null;
}): ReviewBlocker[] {
  const out: ReviewBlocker[] = [];
  if (!input.reviewerEmails.includes(input.email.toLowerCase())) out.push("not_flagged");
  if (!input.hasPublishableKey) out.push("no_publishable_key");
  if (input.version.status !== "draft") out.push("not_draft");
  if (input.version.authorUserId && input.version.authorUserId === input.userId) out.push("is_author");
  if (!input.licensed) out.push("no_licence");
  if (!input.sessionUserId) out.push("no_session");
  else if (input.sessionUserId !== input.userId) out.push("session_mismatch");
  return out;
}

/** Reads a JWT payload without verifying it. Display only; every action re-validates the session with Supabase. */
export function peekJwt(token: string | null | undefined): { sub?: string; exp?: number; aal?: string } | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(json) as { sub?: string; exp?: number; aal?: string };
  } catch {
    return null;
  }
}
