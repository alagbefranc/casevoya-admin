import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure, apiRequest, describe as describeError, withQuery } from "@/client/api";
import { bytes, cents, day, duration, plural, relative, usd, words } from "@/client/format";
import { activeNav, NAV } from "@/client/nav";
import { chipState, navCounts, splitIssues, stepUpNeed, verificationWorkload } from "@/client/session-rules";
import type { Overview, SessionStatus } from "@/client/types";

const NOW = 1_800_000_000;
const signedIn: SessionStatus = { signedIn: true, userId: "u", aal: "aal2", expiresAt: NOW + 3000, stepUpAt: NOW - 60, stepUpFreshUntil: NOW + 840, matchesAccessUser: true };
const signedOut: SessionStatus = { signedIn: false, userId: null, aal: null, expiresAt: null, stepUpAt: null, stepUpFreshUntil: null, matchesAccessUser: false };

function overview(patch: Partial<Overview> = {}): Overview {
  return {
    firms: { total: 3, live: 2, sample: 1, by_verification: {} },
    subscriptions: { exceptions: 0, by_reason: {}, by_status: {} },
    queues: { level: "healthy", counts: {}, oldest_pending_wait_seconds: 0, processing_stuck: 0, failed_last_hour: 0 },
    licences: { due: 0, overdue: 0, never_checked: 0, adverse: 0, needs_review: 0, all: 0 },
    verification_workload: { firms_pending_review: 0, firms_unverified: 0, credentials_needing_review: 0, credentials_never_checked: 0 },
    incidents: { active: 0, active_incidents: 0, worst_severity: null, status: "operational" },
    support: { pending: 0, active: 0 },
    templates: { awaiting_review: 0, published: 0 },
    complaints: { open: 0, ack_overdue: 0, response_overdue: 0, total: 0 },
    generated_at: "2026-10-29T18:40:00Z",
    ...patch,
  };
}

describe("withQuery", () => {
  it("drops empty values and keeps the rest", () => {
    expect(withQuery("/firms", { search: "", plan: "solo", limit: 50, offset: 0, sample: undefined, x: null })).toBe("/firms?plan=solo&limit=50&offset=0");
    expect(withQuery("/firms")).toBe("/firms");
  });
});

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "req-1", ...headers } });

  it("returns data and sends JSON with same-origin credentials", async () => {
    const fetch = vi.fn(async () => json({ data: { ok: 1 }, requestId: "req-1" }));
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest("POST", "/notices", { a: 1 })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/notices");
    expect(init.credentials).toBe("same-origin");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("maps the error shape, capitalising the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "validation_failed", message: "give a reason", details: { issues: [{ path: "reason", message: "Too short" }] }, requestId: "req-9" } }, 422)));
    const error = (await apiRequest("POST", "/x", {}).catch((e: unknown) => e)) as ApiFailure;
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error.code).toBe("validation_failed");
    expect(error.message).toBe("Give a reason");
    expect(error.requestId).toBe("req-9");
    expect(error.issues).toEqual([{ path: "reason", message: "Too short" }]);
  });

  it("treats HTML (Access login) as an ended Access sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(apiRequest("GET", "/session")).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("treats a thrown fetch as a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(apiRequest("GET", "/session")).rejects.toMatchObject({ code: "network" });
  });
});

describe("describe (error copy)", () => {
  it("uses the spec wording for provider failures and quotes the reference for internal", () => {
    expect(describeError(new ApiFailure("upstream_error", "x", 502, "r1")).title).toBe("Casevoya's database did not answer");
    expect(describeError(new ApiFailure("internal", "x", 500, "r2")).body).toContain("Quote this reference: r2");
    expect(describeError(new ApiFailure("csrf_failed", "x", 403, null)).title).toBe("This request was blocked");
    expect(describeError(new ApiFailure("conflict", "A draft is already open", 409, null)).title).toBe("A draft is already open");
  });
});

describe("format", () => {
  it("formats bytes in binary units to one decimal", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(4.2 * 1024 ** 3)).toBe("4.2 GB");
    expect(bytes(null)).toBe("—");
  });
  it("labels money with its currency", () => {
    expect(usd(1.5)).toBe("US$1.50");
    expect(cents(14900, "cad")).toBe("149.00 CAD");
  });
  it("shows calendar dates without shifting them", () => {
    expect(day("2026-11-02")).toMatch(/Nov 2, 2026/);
  });
  it("formats durations and relative times", () => {
    expect(duration(40)).toBe("40 s");
    expect(duration(3600 * 3 + 600)).toBe("3 h 10 min");
    expect(relative(new Date(Date.now() - 12 * 60000).toISOString())).toBe("12 min ago");
    expect(plural(1, "firm")).toBe("1 firm");
    expect(words("pending_review")).toBe("Pending review");
  });
});

describe("step-up decision (spec 1.6)", () => {
  it("asks for sign-in without a matching session", () => {
    expect(stepUpNeed(signedOut, NOW)).toBe("sign-in");
    expect(stepUpNeed({ ...signedIn, matchesAccessUser: false }, NOW)).toBe("sign-in");
  });
  it("shows the inline code when under 60 s of freshness is left", () => {
    expect(stepUpNeed(signedIn, NOW)).toBe("none");
    expect(stepUpNeed({ ...signedIn, stepUpFreshUntil: NOW + 59 }, NOW)).toBe("code");
    expect(stepUpNeed({ ...signedIn, stepUpFreshUntil: null }, NOW)).toBe("code");
  });
});

describe("session chip", () => {
  it("follows the spec 1.6 states", () => {
    expect(chipState(signedOut, NOW).label).toBe("Not signed in");
    expect(chipState(signedIn, NOW)).toMatchObject({ tone: "ok", label: "Verified · 14 min" });
    expect(chipState({ ...signedIn, stepUpFreshUntil: NOW - 1 }, NOW)).toMatchObject({ tone: "info", label: "Signed in" });
    expect(chipState({ ...signedIn, matchesAccessUser: false }, NOW)).toMatchObject({ tone: "warn", label: "Session mismatch" });
  });
});

describe("nav counts (spec 1.5)", () => {
  it("is empty when nothing needs attention", () => {
    expect(navCounts(overview())).toEqual({});
    expect(navCounts(null)).toEqual({});
  });
  it("counts with text, red when adverse", () => {
    const counts = navCounts(overview({
      subscriptions: { exceptions: 3, by_reason: {}, by_status: {} },
      licences: { due: 2, overdue: 0, never_checked: 0, adverse: 1, needs_review: 1, all: 9 },
      support: { pending: 1, active: 0 },
      queues: { level: "unhealthy", counts: {}, oldest_pending_wait_seconds: 0, processing_stuck: 0, failed_last_hour: 0 },
      incidents: { active: 2, active_incidents: 1, worst_severity: "major", status: "major_incident" },
      templates: { awaiting_review: 1, published: 0 },
    }));
    expect(counts.subscriptions).toEqual({ text: "3 exceptions", tone: "w" });
    expect(counts.verification).toEqual({ text: "4 to check", tone: "b" });
    expect(counts.grants?.text).toBe("1 pending");
    expect(counts.health).toEqual({ text: "Unhealthy", tone: "b" });
    expect(counts.incidents).toEqual({ text: "2 active", tone: "b" });
    expect(counts.releases?.text).toBe("1 to review");
  });
  it("computes the verification workload card", () => {
    expect(verificationWorkload(overview({
      licences: { due: 2, overdue: 1, never_checked: 5, adverse: 1, needs_review: 1, all: 9 },
      verification_workload: { firms_pending_review: 1, firms_unverified: 3, credentials_needing_review: 1, credentials_never_checked: 5 },
    }))).toBe(5);
  });
});

describe("splitIssues", () => {
  it("maps dot paths to fields and keeps the rest for the summary", () => {
    const out = splitIssues([{ path: "sources.0.url", message: "Bad url" }, { path: "reason", message: "Too short" }, { path: "", message: "Database said no" }], ["reason", "sources"]);
    expect(out.byField).toEqual({ sources: "Bad url", reason: "Too short" });
    expect(out.summary).toEqual(["Database said no"]);
  });
});

describe("activeNav", () => {
  it("highlights exactly one item, including detail pages", () => {
    expect(activeNav("/")).toBe("overview");
    expect(activeNav("/firms/abc")).toBe("firms");
    expect(activeNav("/releases/templates/x")).toBe("releases");
    expect(activeNav("/config/admins")).toBe("config");
    expect(NAV.flatMap((g) => g.items).length).toBe(15);
  });
});
