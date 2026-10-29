import { describe, expect, it } from "vitest";
import { composeEvidence, draftSchema, extractCitations, hostMatches, peekJwt, reviewBlockers, splitEvidence } from "@/lib/templates";
import { parseEmails, readEnv } from "@/lib/env";

const domains = [
  { host: "canada.ca", matchKind: "suffix", authority: "Government of Canada" },
  { host: "justice.gc.ca", matchKind: "suffix", authority: "Justice Laws" },
];

const base = {
  userId: "u-reviewer",
  templateReviewer: true,
  hasPublishableKey: true,
  version: { status: "draft", authorUserId: "u-author" },
  licensed: true,
  sessionUserId: "u-reviewer",
};

describe("reviewBlockers", () => {
  it("lets a flagged, licensed, signed-in reviewer who is not the author decide", () => {
    expect(reviewBlockers(base)).toEqual([]);
  });
  it("never lets the author approve their own draft", () => {
    expect(reviewBlockers({ ...base, version: { status: "draft", authorUserId: "u-reviewer" } })).toContain("is_author");
  });
  it("requires the reviewer flag, a licence, a key, an open draft and the right session", () => {
    expect(reviewBlockers({ ...base, templateReviewer: false })).toContain("not_flagged");
    expect(reviewBlockers({ ...base, licensed: false })).toContain("no_licence");
    expect(reviewBlockers({ ...base, hasPublishableKey: false })).toContain("no_publishable_key");
    expect(reviewBlockers({ ...base, version: { status: "published", authorUserId: "u-author" } })).toContain("not_draft");
    expect(reviewBlockers({ ...base, sessionUserId: null })).toContain("no_session");
    expect(reviewBlockers({ ...base, sessionUserId: "someone-else" })).toContain("session_mismatch");
  });
});

describe("citations", () => {
  it("marks official hosts by suffix and rejects look-alikes", () => {
    expect(hostMatches("www.canada.ca", domains[0])).toBe(true);
    expect(hostMatches("canada.ca", domains[0])).toBe(true);
    expect(hostMatches("notcanada.ca", domains[0])).toBe(false);
    expect(hostMatches("canada.ca.evil.com", domains[0])).toBe(false);
  });
  it("extracts distinct URLs and labels them", () => {
    const list = extractCitations(
      ["See https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html.", "and http://example.com/x", "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html"],
      domains,
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ official: true, authority: "Government of Canada" });
    expect(list[0].url.endsWith(".html")).toBe(true);
    expect(list[1]).toMatchObject({ official: false, host: "example.com" });
  });
  it("does not treat plain http on an official host as official", () => {
    expect(extractCitations(["http://www.canada.ca/x"], domains)[0].official).toBe(false);
  });
  it("round-trips sources through the test evidence", () => {
    const stored = composeEvidence("Checked against IRCC page.", ["https://www.canada.ca/a", "https://laws-lois.justice.gc.ca/b"]);
    expect(splitEvidence(stored)).toEqual({ evidence: "Checked against IRCC page.", sources: ["https://www.canada.ca/a", "https://laws-lois.justice.gc.ca/b"] });
    expect(splitEvidence("no sources here")).toEqual({ evidence: "no sources here", sources: [] });
  });
});

describe("draftSchema", () => {
  const good = {
    stableKey: "study_permit_checklist",
    title: "Study permit checklist",
    summary: "",
    items: ["Letter of acceptance"],
    authorName: "Casevoya",
    evidence: "Compared with the IRCC checklist on 29 Oct.",
    sources: ["https://www.canada.ca/en/immigration-refugees-citizenship.html"],
    effectiveOn: "2026-11-01",
    changelog: "First version",
  };
  it("accepts a valid draft", () => {
    expect(draftSchema(domains).safeParse(good).success).toBe(true);
  });
  it("requires at least one official https source", () => {
    expect(draftSchema(domains).safeParse({ ...good, sources: [] }).success).toBe(false);
    expect(draftSchema(domains).safeParse({ ...good, sources: ["https://example.com/x"] }).success).toBe(false);
    expect(draftSchema(domains).safeParse({ ...good, sources: ["http://www.canada.ca/x"] }).success).toBe(false);
  });
  it("enforces the database's key and size rules", () => {
    expect(draftSchema(domains).safeParse({ ...good, stableKey: "Study Permit" }).success).toBe(false);
    expect(draftSchema(domains).safeParse({ ...good, items: [] }).success).toBe(false);
    expect(draftSchema(domains).safeParse({ ...good, evidence: "x".repeat(1990) }).success).toBe(false);
  });
});

describe("reviewer config", () => {
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k", CF_ACCESS_TEAM_DOMAIN: "t.cloudflareaccess.com", CF_ACCESS_AUD: "a", ADMIN_ALLOWED_EMAILS: "admin@casevoya.ca" };
  it("defaults to no publishable key and the production admin origin", () => {
    expect(readEnv(env)).toMatchObject({ supabasePublishableKey: null, adminOrigin: "https://admin.casevoya.ca" });
    expect(parseEmails("")).toEqual([]);
  });
  it("takes an https ADMIN_ORIGIN and refuses anything else", () => {
    expect(readEnv({ ...env, ADMIN_ORIGIN: "https://staging-admin.casevoya.ca/" }).adminOrigin).toBe("https://staging-admin.casevoya.ca");
    expect(() => readEnv({ ...env, ADMIN_ORIGIN: "http://admin.casevoya.ca" })).toThrow(/ADMIN_ORIGIN/);
  });
  it("refuses a secret key in the publishable slot", () => {
    expect(() => readEnv({ ...env, SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" })).toThrow(/publishable/);
  });
});

describe("peekJwt", () => {
  it("reads the payload without verifying", () => {
    const payload = btoa(JSON.stringify({ sub: "u1", aal: "aal2", exp: 1 })).replace(/=+$/, "");
    expect(peekJwt(`h.${payload}.s`)).toEqual({ sub: "u1", aal: "aal2", exp: 1 });
    expect(peekJwt("garbage")).toBeNull();
  });
});
