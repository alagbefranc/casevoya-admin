/**
 * Pure Config rules (spec 2.8), shared by the API and the browser. The database
 * (public.admin_config_set_setting with public.product_setting_rules) checks the same rules again; these
 * give the form its errors before anything is sent.
 */

export type SettingKind = "boolean" | "number" | "enum" | "duration" | "text";
export type Danger = "none" | "caution" | "critical";

export type SettingRule = {
  key: string;
  kind: SettingKind;
  /** The key inside the stored value that changes (null for a {unit, count} duration). */
  field: string | null;
  min_value: number | null;
  max_value: number | null;
  choices: string[] | null;
  units: string[] | null;
  max_length: number | null;
  pattern: string | null;
  danger: Danger;
  danger_note: string | null;
};

export type Duration = { unit: string; count: number };

export const DURATION_MAX = 3650;

/** The part of a stored value the rule edits: the field's value, or the {unit, count} itself. */
export function editableValue(rule: Pick<SettingRule, "kind" | "field">, stored: unknown): unknown {
  if (rule.kind === "duration") return stored;
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || !rule.field) return undefined;
  return (stored as Record<string, unknown>)[rule.field];
}

/** The whole value after the change (other keys kept), as the database builds it. */
export function nextStoredValue(rule: Pick<SettingRule, "kind" | "field">, stored: unknown, input: unknown): unknown {
  if (rule.kind === "duration") return input;
  const base = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return { ...base, [rule.field as string]: typeof input === "string" ? input.trim() : input };
}

/** Null when the input is acceptable for the rule, else the message the form shows. */
export function checkSettingInput(rule: SettingRule, input: unknown): string | null {
  switch (rule.kind) {
    case "boolean":
      return typeof input === "boolean" ? null : "Choose on or off";
    case "number": {
      const min = Number(rule.min_value);
      const max = Number(rule.max_value);
      if (typeof input !== "number" || !Number.isInteger(input) || input < min || input > max) return `Enter a whole number from ${min} to ${max}`;
      return null;
    }
    case "enum":
      return typeof input === "string" && (rule.choices ?? []).includes(input) ? null : `Choose one of ${(rule.choices ?? []).join(", ")}`;
    case "text": {
      if (typeof input !== "string") return "Enter text";
      const t = input.trim();
      const max = rule.max_length ?? 500;
      if (t.length < 1 || t.length > max) return `Enter 1 to ${max} characters`;
      if (rule.pattern) {
        try {
          if (!new RegExp(rule.pattern).test(t)) return "The text is not in the expected format";
        } catch {
          return null; // the database checks its own pattern
        }
      }
      return null;
    }
    case "duration": {
      const v = input as Partial<Duration> | null;
      if (!v || typeof v !== "object" || Object.keys(v).length !== 2 || typeof v.unit !== "string" || typeof v.count !== "number") return "A duration is a count and a unit";
      if (!(rule.units ?? []).includes(v.unit)) return `Use ${(rule.units ?? []).map((u) => u.replace(/_/g, " ")).join(" or ")}`;
      if (!Number.isInteger(v.count) || v.count < 1 || v.count > DURATION_MAX) return `Enter a whole number from 1 to ${DURATION_MAX}`;
      return null;
    }
  }
  return "Unknown setting kind";
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

/** A critical change needs the key typed exactly; the database refuses otherwise. */
export function needsTypedKey(danger: Danger): boolean {
  return danger === "critical";
}

/** "On" / "Off", "14 days", a number with separators, or the text. */
export function formatEditable(kind: SettingKind, v: unknown): string {
  if (kind === "boolean") return v === true ? "On" : v === false ? "Off" : "—";
  if (kind === "duration" && v && typeof v === "object") {
    const { unit, count } = v as Duration;
    const u = unit.replace(/_/g, " ");
    return `${count} ${count === 1 ? u.replace(/s$/, "") : u}`;
  }
  if (kind === "number" && typeof v === "number") return v.toLocaleString("en-CA");
  if (v === undefined || v === null) return "—";
  return String(v);
}
