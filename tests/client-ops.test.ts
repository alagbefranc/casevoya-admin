import { describe, expect, it } from "vitest";
import { minutesLeft, SCOPES } from "@/client/grants";
import { audienceText, fromLocalInput, severityTone, toLocalInput } from "@/client/notices";

const now = Date.parse("2026-10-29T12:00:00Z") / 1000;

describe("minutesLeft", () => {
  it("counts down from ends_at for active grants", () => {
    expect(minutesLeft({ effective_status: "approved", ends_at: "2026-10-29T12:25:30Z", minutes_left: 99 }, now)).toBe(26);
  });
  it("never goes negative", () => {
    expect(minutesLeft({ effective_status: "active", ends_at: "2026-10-29T11:00:00Z", minutes_left: null }, now)).toBe(0);
  });
  it("falls back to minutes_left and ignores non-active grants", () => {
    expect(minutesLeft({ effective_status: "approved", ends_at: null, minutes_left: 12 }, now)).toBe(12);
    expect(minutesLeft({ effective_status: "pending", ends_at: "2026-10-29T13:00:00Z", minutes_left: 60 }, now)).toBeNull();
  });
  it("offers the four scopes the API accepts", () => {
    expect(SCOPES).toEqual(["firm_settings", "matter_documents", "matter_records", "matter_all"]);
  });
});

describe("notices helpers", () => {
  it("maps severity to tones", () => {
    expect(severityTone("major")).toBe("bad");
    expect(severityTone("minor")).toBe("warn");
    expect(severityTone("info")).toBe("info");
  });
  it("describes the audience", () => {
    expect(audienceText({ audience: "all", targets: [] })).toBe("All firms");
    expect(audienceText({ audience: "listed", targets: [{ id: "a", display_name: "A" }, { id: "b", display_name: "B" }] })).toMatch(/2 firms/);
  });
  it("round-trips datetime-local values in the viewer's zone", () => {
    const iso = "2026-11-02T14:30:00.000Z";
    const local = toLocalInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(local)).toBe(iso);
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });
});
