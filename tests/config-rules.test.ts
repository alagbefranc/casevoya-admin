import { describe, expect, it } from "vitest";
import { checkSettingInput, editableValue, formatEditable, needsTypedKey, nextStoredValue, sameValue, type SettingRule } from "@/lib/config-rules";

const rule = (r: Partial<SettingRule>): SettingRule => ({
  key: "k", kind: "boolean", field: "enabled", min_value: null, max_value: null, choices: null, units: null, max_length: null, pattern: null, danger: "none", danger_note: null, ...r,
});

describe("config rules", () => {
  it("checks booleans", () => {
    expect(checkSettingInput(rule({}), true)).toBeNull();
    expect(checkSettingInput(rule({}), "true")).toMatch(/on or off/);
  });
  it("checks number ranges and whole numbers", () => {
    const r = rule({ kind: "number", field: "seconds", min_value: 30, max_value: 900 });
    expect(checkSettingInput(r, 120)).toBeNull();
    for (const v of [29, 901, 12.5, "120", NaN]) expect(checkSettingInput(r, v)).toMatch(/30 to 900/);
  });
  it("checks enums", () => {
    const r = rule({ kind: "enum", field: "mode", choices: ["a", "b"] });
    expect(checkSettingInput(r, "b")).toBeNull();
    expect(checkSettingInput(r, "c")).toMatch(/one of a, b/);
  });
  it("checks durations", () => {
    const r = rule({ kind: "duration", field: null, units: ["days", "months"] });
    expect(checkSettingInput(r, { unit: "days", count: 30 })).toBeNull();
    expect(checkSettingInput(r, { unit: "weeks", count: 3 })).toMatch(/days or months/);
    expect(checkSettingInput(r, { unit: "days", count: 0 })).toMatch(/1 to 3650/);
    expect(checkSettingInput(r, { unit: "days", count: 3651 })).toMatch(/1 to 3650/);
    expect(checkSettingInput(r, { unit: "days", count: 3, extra: 1 })).toMatch(/count and a unit/);
  });
  it("checks text length and pattern", () => {
    const r = rule({ kind: "text", field: "label", max_length: 10, pattern: "^[a-z ]+$" });
    expect(checkSettingInput(r, " ok ")).toBeNull();
    expect(checkSettingInput(r, "")).toMatch(/1 to 10/);
    expect(checkSettingInput(r, "way too long here")).toMatch(/1 to 10/);
    expect(checkSettingInput(r, "Bad1")).toMatch(/format/);
  });
  it("edits one field and keeps the rest of the stored value", () => {
    const r = rule({ kind: "number", field: "bytes", min_value: 1, max_value: 10 });
    const stored = { bytes: 5, ceiling_bytes: 10 };
    expect(editableValue(r, stored)).toBe(5);
    expect(nextStoredValue(r, stored, 7)).toEqual({ bytes: 7, ceiling_bytes: 10 });
    expect(sameValue(nextStoredValue(r, stored, 5), stored)).toBe(true);
    const d = rule({ kind: "duration", field: null, units: ["days"] });
    expect(nextStoredValue(d, { unit: "days", count: 1 }, { unit: "days", count: 2 })).toEqual({ unit: "days", count: 2 });
  });
  it("needs typed confirmation only for critical changes", () => {
    expect(needsTypedKey("critical")).toBe(true);
    expect(needsTypedKey("caution")).toBe(false);
    expect(needsTypedKey("none")).toBe(false);
  });
  it("formats values for the confirm dialog", () => {
    expect(formatEditable("boolean", true)).toBe("On");
    expect(formatEditable("duration", { unit: "business_days", count: 1 })).toBe("1 business day");
    expect(formatEditable("number", 26214400)).toBe("26,214,400");
  });
});
