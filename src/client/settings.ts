/** Pure helpers for Config (spec 2.8). */

export type SettingValue = { unit: string; count: number } | Record<string, unknown> | unknown[] | string | number | boolean | null;

/** "{unit, count}" as "14 days"; anything else as compact JSON (spec 2.8). */
export function formatSetting(v: SettingValue): string {
  if (v && typeof v === "object" && !Array.isArray(v) && "unit" in v && "count" in v && Object.keys(v).length === 2) {
    const { unit, count } = v as { unit: string; count: number };
    const u = unit.replace(/_/g, " ");
    return `${count} ${count === 1 ? u.replace(/s$/, "") : u}`;
  }
  const s = JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}
