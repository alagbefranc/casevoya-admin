/** Times are shown in the operator's zone (EST all year, America/Atikokan) with the zone named. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Atikokan",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export function flashParams(params: Record<string, string | string[] | undefined>): { ok?: string; error?: string } {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 300);
  return { ok: pick(params.ok), error: pick(params.error) };
}
