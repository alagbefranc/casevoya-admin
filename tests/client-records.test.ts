import { describe, expect, it } from "vitest";
import { keyDate, noLimitText, pct, usageFlag } from "@/client/billing";
import { CSV_MAX_BYTES, isRegisterUrl, previewResult } from "@/client/licence-rules";
import { ACTION_PREFIX, countPairs, daysLeftText, daysLeftTone, localToIso, migrationStatus, rangeError, sourceLabel, stageIndex } from "@/client/records";
import { formatSetting } from "@/client/settings";

const row = { reasons: [] as string[], restricted_at: null, past_due_since: null, trial_ends_at: null, cancel_at: null, current_period_end: null } as Parameters<typeof keyDate>[0];

describe("keyDate", () => {
  it("prefers restriction over past due over trial", () => {
    const all = { ...row, reasons: ["restricted", "past_due", "trial_ending"], restricted_at: "2026-10-01T12:00:00Z", past_due_since: "2026-09-20T12:00:00Z", trial_ends_at: "2026-11-01T12:00:00Z" };
    expect(keyDate(all)).toMatch(/^Restricted since /);
    expect(keyDate({ ...all, reasons: ["past_due", "trial_ending"] })).toMatch(/^Due since /);
    expect(keyDate({ ...all, reasons: ["trial_ending"] })).toMatch(/^Trial ends /);
  });
  it("needs the matching date and falls back to renewal or null", () => {
    expect(keyDate({ ...row, reasons: ["restricted"] })).toBeNull();
    expect(keyDate({ ...row, reasons: ["cancel_scheduled"], cancel_at: "2026-12-01T12:00:00Z" })).toMatch(/^Cancels /);
    expect(keyDate({ ...row, current_period_end: "2026-12-01T12:00:00Z" })).toMatch(/^Renews /);
  });
});

describe("usage helpers", () => {
  it("over beats near", () => {
    expect(usageFlag(["seats_near", "seats_over"], "seats")).toBe("over");
    expect(usageFlag(["matters_near"], "matters")).toBe("near");
    expect(usageFlag(["matters_near"], "storage")).toBeNull();
  });
  it("names missing limits", () => {
    expect(noLimitText("enterprise", "active")).toBe("No limit");
    expect(noLimitText(null, null)).toBe("Trial: no plan limit");
    expect(noLimitText("solo", "trial")).toBe("Trial: no plan limit");
    expect(noLimitText("team", "active")).toBe("No limit");
  });
  it("percent of limit", () => {
    expect(pct(9, 10)).toBe(90);
    expect(pct(5, null)).toBeNull();
    expect(pct(5, 0)).toBeNull();
  });
});

describe("licence rules", () => {
  const ok = { registerStatus: "active" as const, entitledToPractise: true, disciplineSuspended: false, disciplineRevoked: false, disciplineRestricted: false };
  it("follows the database order", () => {
    expect(previewResult({ ...ok, registerStatus: "" })).toBeNull();
    expect(previewResult({ ...ok, disciplineRevoked: true, disciplineSuspended: true })).toBe("revoked");
    expect(previewResult({ ...ok, disciplineSuspended: true, registerStatus: "inactive" })).toBe("suspended");
    expect(previewResult({ ...ok, registerStatus: "inactive", entitledToPractise: false })).toBe("inactive");
    expect(previewResult({ ...ok, entitledToPractise: false })).toBe("not_entitled");
    expect(previewResult({ ...ok, disciplineRestricted: true })).toBe("verified");
  });
  it("accepts only https register links", () => {
    expect(isRegisterUrl("https://register.college-ic.ca/Public-Register-EN/Licensee/Profile.aspx?ID=1")).toBe(true);
    expect(isRegisterUrl("http://register.college-ic.ca/x")).toBe(false);
    expect(isRegisterUrl("https://register.college-ic.ca.evil.test/x")).toBe(false);
    expect(isRegisterUrl("not a url")).toBe(false);
    expect(CSV_MAX_BYTES).toBe(8_000_000);
  });
});

describe("settings", () => {
  it("formats durations and other shapes", () => {
    expect(formatSetting({ unit: "days", count: 14 })).toBe("14 days");
    expect(formatSetting({ unit: "business_days", count: 1 })).toBe("1 business day");
    expect(formatSetting({ enabled: true })).toBe('{"enabled":true}');
    expect(formatSetting({ unit: "days", count: 1, extra: 1 })).toBe('{"unit":"days","count":1,"extra":1}');
    expect(formatSetting({ a: "x".repeat(200) }).length).toBe(118);
  });
});

describe("audit filters", () => {
  it("validates prefixes and ranges", () => {
    expect(ACTION_PREFIX.test("admin_portal.")).toBe(true);
    expect(ACTION_PREFIX.test("Admin")).toBe(false);
    expect(localToIso("")).toBeNull();
    expect(localToIso("garbage")).toBeNull();
    expect(localToIso("2026-10-29T10:00")).toMatch(/^2026-10-29T\d\d:00:00\.000Z$/);
    expect(rangeError("2026-10-30T00:00:00Z", "2026-10-29T00:00:00Z")).toBe("From is before To");
    expect(rangeError("2026-10-29T00:00:00Z", "2026-10-29T00:00:00Z")).toBeNull();
    expect(rangeError(null, "2026-10-29T00:00:00Z")).toBeNull();
  });
});

describe("privacy", () => {
  it("stage position", () => {
    expect(stageIndex("received")).toBe(1);
    expect(stageIndex("closed")).toBe(6);
    expect(stageIndex("weird")).toBe(0);
  });
  it("days left", () => {
    expect(daysLeftTone(-1, false)).toBe("bad");
    expect(daysLeftTone(5, false)).toBe("warn");
    expect(daysLeftTone(6, false)).toBeNull();
    expect(daysLeftTone(-3, true)).toBeNull();
    expect(daysLeftText(-5, false)).toBe("5 overdue");
    expect(daysLeftText(0, false)).toBe("Due today");
    expect(daysLeftText(4, true)).toBe("—");
  });
});

describe("migration", () => {
  it("stuck overrides status", () => {
    expect(migrationStatus({ status: "committing", stuck: true })).toEqual({ label: "Stuck", tone: "bad" });
    expect(migrationStatus({ status: "rolled_back", stuck: false })).toEqual({ label: "Rolled back", tone: "warn" });
    expect(migrationStatus({ status: "new_thing", stuck: false }).tone).toBe("neutral");
  });
  it("count pairs and source labels", () => {
    expect(countPairs({ b: 2, a: 1, c: "x" })).toEqual([["a", 1], ["b", 2]]);
    expect(countPairs(null)).toEqual([]);
    expect(countPairs([1, 2])).toEqual([]);
    expect(sourceLabel("csv")).toBe("CSV");
    expect(sourceLabel("clio_manage")).toBe("Clio Manage");
    expect(sourceLabel(null)).toBe("—");
  });
});
