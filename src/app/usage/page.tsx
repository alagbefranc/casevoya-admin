"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, FolderOpen, HardDrive, Info, LayoutGrid, Users } from "@/components/icons";
import { withQuery } from "@/client/api";
import { useApi, useQueryState } from "@/client/hooks";
import { bytes, cents, num, usd, words } from "@/client/format";
import { noLimitText, pct, usageFlag } from "@/client/billing";
import { Alert, Badge, DataTable, Dialog, Empty, FilterBar, FilteredEmpty, MetricCard, Meter, NotBuilt, PageHeader, Pager, Panel, SampleBadge, SearchField, Section, SelectField, SkeletonCards, SkeletonRows } from "@/components/ui";

type Plan = { seats: number | null; matters: number | null; storage_gb: number | null; monthly_cents: number | null };
type UsageRow = {
  organization_id: string; display_name: string; slug: string; sample_mode: boolean; plan: string | null; subscription_status: string | null;
  seats_active: number; seats_invited: number; seat_limit: number | null; active_matters: number; sample_matters: number; matter_limit: number | null;
  storage_bytes: number; storage_limit_bytes: number | null; ai_runs_30d: number; ai_failed_30d: number; ai_tokens_30d: number; ai_cost_usd_30d: number; flags: string[];
};
type Usage = {
  items: UsageRow[]; total: number; flagged_total: number; limit: number; offset: number; near_threshold: number; ai_window_days: number;
  totals: { seats_active: number; active_matters: number; storage_bytes: number; ai_runs_30d: number; ai_cost_usd_30d: number; ai_failed_30d?: number };
  plans: Record<string, Plan>;
};
const SORTS = [
  { value: "name_asc", label: "Name" },
  { value: "seats_desc", label: "Seats" },
  { value: "matters_desc", label: "Matters" },
  { value: "storage_desc", label: "Storage" },
  { value: "ai_cost_desc", label: "AI cost" },
];
const LIMIT = 50;

function Metric({ used, limit, flag, fmt, row, extra }: { used: number; limit: number | null; flag: "near" | "over" | null; fmt: (n: number) => string; row: UsageRow; extra?: string | null }) {
  if (limit === null) {
    return <><Badge>{noLimitText(row.plan, row.subscription_status)}</Badge><small>{fmt(used)}{extra ? ` · ${extra}` : ""}</small></>;
  }
  const p = pct(used, limit);
  return (
    <>
      <Meter used={used} limit={limit} flag={flag} />
      <small className={flag === "over" ? "t-bad" : flag === "near" ? "t-warn" : undefined}>
        {fmt(used)} of {fmt(limit)}{flag && p !== null ? ` · ${p}%` : ""}{extra ? <span className="muted"> · {extra}</span> : null}
      </small>
    </>
  );
}

export default function UsagePage() {
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const search = q.get("search") ?? "";
  const flaggedOnly = q.get("flaggedOnly") === "true";
  const sort = q.get("sort") ?? "name_asc";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const [plansOpen, setPlansOpen] = useState(false);
  const usage = useApi<Usage>(withQuery("/usage", { search, flaggedOnly: flaggedOnly || null, sort: sort === "name_asc" ? null : sort, limit: LIMIT, offset }));
  const onSearch = useCallback((v: string) => setQ({ search: v, offset: null }), [setQ]);
  const d = usage.data;

  return (
    <>
      <PageHeader
        title="Usage"
        lede="Seats, matters, storage and AI use per firm against plan limits. Amber at 90 %, red when over."
        actions={<button type="button" className="btn" onClick={() => setPlansOpen(true)} disabled={!d}><Info className="ic" aria-hidden /> Plan allowances</button>}
      />
      {d ? (
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <MetricCard icon={<Users className="ic" aria-hidden />} label="Seats in use" value={num(d.totals.seats_active)} />
          <MetricCard icon={<FolderOpen className="ic" aria-hidden />} label="Matters" value={num(d.totals.active_matters)} />
          <MetricCard icon={<HardDrive className="ic" aria-hidden />} label="Storage" value={bytes(d.totals.storage_bytes)} />
          <MetricCard icon={<Bot className="ic" aria-hidden />} label={`AI · ${d.ai_window_days} days`} value={num(d.totals.ai_runs_30d)} sub={`${typeof d.totals.ai_failed_30d === "number" ? `${num(d.totals.ai_failed_30d)} failed · ` : ""}${usd(d.totals.ai_cost_usd_30d)}`} />
        </div>
      ) : usage.error ? null : <div style={{ marginBottom: 12 }}><SkeletonCards n={4} /></div>}
      {d && (d.flagged_total > 0 || flaggedOnly) ? (
        <div className="chips">
          <button type="button" className={`c ${flaggedOnly ? "on" : "b"}`} aria-pressed={flaggedOnly} onClick={() => setQ({ flaggedOnly: flaggedOnly ? null : "true", offset: null })}>
            {num(d.flagged_total)} flagged (near or over a limit)
          </button>
        </div>
      ) : null}
      <FilterBar active={(flaggedOnly ? 1 : 0) + (sort !== "name_asc" ? 1 : 0)}>
        <SearchField id="u-search" label="Search" placeholder="Search firm" value={search} onChange={onSearch} />
        <SelectField id="u-show" label="Show" all={null} value={flaggedOnly ? "flagged" : ""} onChange={(v) => setQ({ flaggedOnly: v === "flagged" ? "true" : null, offset: null })} options={[{ value: "", label: "All firms" }, { value: "flagged", label: "Near or over a limit only" }]} />
        <SelectField id="u-sort" label="Sort" all={null} value={sort} onChange={(v) => setQ({ sort: v === "name_asc" ? null : v, offset: null })} options={SORTS} />
      </FilterBar>
      <Panel title="Firms" icon={<LayoutGrid className="ic" aria-hidden />} right={d ? `${num(d.total)} ${d.total === 1 ? "firm" : "firms"}` : null}>
        <Section loaded={usage} skeleton={<SkeletonRows n={6} />}>
          {(p) => (
            <>
              <DataTable
                caption="Usage by firm"
                rows={p.items}
                rowKey={(r) => r.organization_id}
                onRowClick={(r) => router.push(`/firms/${r.organization_id}`)}
                empty={flaggedOnly && !search
                  ? <div style={{ padding: 16 }}><Alert tone="ok">No firm is near or over a plan limit.</Alert></div>
                  : search || flaggedOnly ? <FilteredEmpty onClear={() => setQ({ search: null, flaggedOnly: null, offset: null })} />
                  : <Empty title="No firms yet." />}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (r) => <><b><Link href={`/firms/${r.organization_id}`}>{r.display_name}</Link></b> <SampleBadge on={r.sample_mode} /><small>{[r.plan ? words(r.plan) : "No plan", r.subscription_status ? words(r.subscription_status) : null].filter(Boolean).join(" · ")}</small></> },
                  { key: "seats", label: "Seats", render: (r) => <Metric row={r} used={r.seats_active} limit={r.seat_limit} flag={usageFlag(r.flags, "seats")} fmt={num} extra={r.seats_invited ? `+${r.seats_invited} invited` : null} /> },
                  { key: "matters", label: "Matters", render: (r) => <Metric row={r} used={r.active_matters} limit={r.matter_limit} flag={usageFlag(r.flags, "matters")} fmt={num} extra={r.sample_matters ? `${r.sample_matters} sample` : null} /> },
                  { key: "storage", label: "Storage", render: (r) => <Metric row={r} used={r.storage_bytes} limit={r.storage_limit_bytes} flag={usageFlag(r.flags, "storage")} fmt={bytes} /> },
                  { key: "ai", label: `AI (${p.ai_window_days} d)`, render: (r) => `${num(r.ai_runs_30d)} runs · ${num(r.ai_failed_30d)} failed · ${usd(r.ai_cost_usd_30d)}` },
                ]}
              />
              <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
      <p className="foot">Limits are reported here, not enforced. Per-firm limit overrides: <NotBuilt /></p>
      <Dialog open={plansOpen && Boolean(d)} title="Plan allowances" onClose={() => setPlansOpen(false)} footer={<button type="button" className="btn" onClick={() => setPlansOpen(false)}>Close</button>}>
        <p className="muted" style={{ marginTop: 0 }}>From the <code>subscription.plans</code> setting. Seat limits add any extra seats a firm bought. Near means {Math.round((d?.near_threshold ?? 0.9) * 100)} % or more.</p>
        <div className="tw">
          <table className="dt">
            <thead><tr><th scope="col">Plan</th><th scope="col">Seats</th><th scope="col">Matters</th><th scope="col">Storage</th><th scope="col">Monthly</th></tr></thead>
            <tbody>
              {Object.entries(d?.plans ?? {}).map(([k, v]) => (
                <tr key={k}>
                  <td data-l="" className="first"><b>{words(k)}</b></td>
                  <td data-l="Seats">{v.seats ?? "No limit"}</td>
                  <td data-l="Matters">{v.matters !== null ? num(v.matters) : "No limit"}</td>
                  <td data-l="Storage">{v.storage_gb !== null ? `${num(v.storage_gb)} GB` : "No limit"}</td>
                  <td data-l="Monthly">{v.monthly_cents !== null ? cents(v.monthly_cents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </>
  );
}
