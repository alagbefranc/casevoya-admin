/** Formatting rules from docs/FRONTEND-SPEC.md 1.10. Times in the viewer's zone, always with the zone label. */
const dateTime = new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const dateOnly = new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });

function toDate(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const dash = "—";
export function when(v: string | number | null | undefined): string {
  const d = toDate(v);
  return d ? dateTime.format(d).replace(/\./g, "") : dash;
}
export function day(v: string | null | undefined): string {
  if (!v) return dash;
  // Calendar dates (YYYY-MM-DD) are shown as dates, never shifted by the viewer's zone.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : toDate(v);
  return d ? dateOnly.format(d).replace(/\./g, "") : dash;
}
export function clock(v: string | number | Date | null | undefined): string {
  const d = v instanceof Date ? v : toDate(v ?? null);
  return d ? timeOnly.format(d).replace(/\./g, "") : dash;
}
export function relative(v: string | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return dash;
  const mins = Math.round((now - d.getTime()) / 60000);
  if (Math.abs(mins) < 1) return "just now";
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const abs = Math.abs(mins);
  const text = abs < 60 ? fmt(abs, "min").replace("mins", "min") : abs < 1440 ? fmt(Math.round(abs / 60), "hour") : fmt(Math.round(abs / 1440), "day");
  return mins >= 0 ? `${text} ago` : `in ${text}`;
}
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return dash;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 48) return rest ? `${h} h ${rest} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}
export function minutes(n: number | null | undefined): string {
  return n === null || n === undefined ? dash : duration(n * 60);
}
export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return dash;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return i === 0 ? `${v} B` : `${v.toFixed(1)} ${units[i]}`;
}
export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? dash : new Intl.NumberFormat("en-CA").format(n);
}
export function usd(n: number | null | undefined): string {
  return n === null || n === undefined ? dash : `US$${Number(n).toFixed(2)}`;
}
export function cents(n: number | null | undefined, currency = "cad"): string {
  if (n === null || n === undefined) return dash;
  return `${(n / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
export function words(s: string | null | undefined): string {
  if (!s) return dash;
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function short(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : dash;
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
