import { describe, expect, it } from "vitest";
import { estLocalToIso, postNoticeSchema, supportRequestSchema } from "@/lib/forms";

const ORG = "11111111-1111-4111-8111-111111111111";

describe("estLocalToIso", () => {
  it("reads datetime-local as UTC-5", () => {
    expect(estLocalToIso("2026-10-29T22:00")).toBe("2026-10-30T03:00:00.000Z");
    expect(estLocalToIso("")).toBeNull();
  });
  it("rejects other shapes", () => {
    expect(() => estLocalToIso("tomorrow")).toThrow();
  });
});

describe("postNoticeSchema", () => {
  const base = { kind: "incident", severity: "minor", title: "Email delays", body: "Some emails are late.", startsAt: null, endsAt: null, audience: "all", firmIds: [], publish: false };
  it("accepts an all-firms incident", () => expect(postNoticeSchema.safeParse(base).success).toBe(true));
  it("needs an end for maintenance", () => expect(postNoticeSchema.safeParse({ ...base, kind: "maintenance" }).success).toBe(false));
  it("needs firms for a listed audience", () => expect(postNoticeSchema.safeParse({ ...base, audience: "listed" }).success).toBe(false));
});

describe("supportRequestSchema", () => {
  const base = { organizationId: ORG, scope: "firm_settings", matterId: null, requesterName: "Casevoya support", ticketRef: null, notIncluded: null, reason: "Investigating a settings bug", minutes: 60, confirm: true };
  it("accepts firm settings access", () => expect(supportRequestSchema.safeParse(base).success).toBe(true));
  it("requires the email confirmation", () => expect(supportRequestSchema.safeParse({ ...base, confirm: false }).success).toBe(false));
  it("requires a matter for matter scopes", () => expect(supportRequestSchema.safeParse({ ...base, scope: "matter_documents" }).success).toBe(false));
  it("refuses records_set (not offered)", () => expect(supportRequestSchema.safeParse({ ...base, scope: "records_set" }).success).toBe(false));
  it("bounds the minutes", () => expect(supportRequestSchema.safeParse({ ...base, minutes: 300 }).success).toBe(false));
});
