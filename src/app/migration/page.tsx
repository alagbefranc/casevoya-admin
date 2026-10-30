"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, FolderSync, RefreshCw, Trash2 } from "lucide-react";
import { withQuery } from "@/client/api";
import { useFirmFilter } from "@/client/firm-filter";
import { useApi, useQueryState } from "@/client/hooks";
import { bytes, clock, dash, day, num, words } from "@/client/format";
import { MIGRATION_STATUSES, countPairs, migrationStatus, sourceLabel } from "@/client/records";
import { Badge, Empty, FilterBar, FilteredEmpty, MetricCard, PageHeader, Pager, Panel, SampleBadge, Section, SelectField, SkeletonCards, SkeletonRows } from "@/components/ui";

type Job = {
  id: string; organization_id: string; firm_name: string; kind: string; source_system: string | null; status: string; is_sample: boolean; byte_size: number | null;
  source_row_count: number | null; staged_row_count: number | null; attachment_files: number | null; attachment_bytes: number | null;
  plan_counts: unknown; result_counts: unknown; pilot_counts: unknown; exception_count: number; pilot_size: number | null;
  verified_at: string | null; checked_at: string | null; pilot_started_at: string | null; pilot_completed_at: string | null; pilot_signed_off_at: string | null;
  full_run_started_at: string | null; commit_started_at: string | null; committed_at: string | null; commit_verified_at: string | null;
  rolled_back_at: string | null; discarded_at: string | null; purge_after: string | null; staging_purged_at: string | null; stuck: boolean; purge_due: boolean; created_at: string; updated_at: string;
};
type Jobs = { items: Job[]; total: number; summary: { by_status: Record<string, number>; stuck: number; purge_due: number; active: number }; stuck_after_minutes: number; limit: number; offset: number };
const LIMIT = 50;

function Counts({ title, v }: { title: string; v: unknown }) {
  const pairs = countPairs(v);
  return (
    <div>
      <b style={{ fontSize: 12.5 }}>{title}</b>
      {pairs.length ? <dl className="kv">{pairs.map(([k, n]) => <Fragment key={k}><dt>{words(k)}</dt><dd>{num(n)}</dd></Fragment>)}</dl> : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>None</p>}
    </div>
  );
}

export default function MigrationPage() {
  const [q, setQ] = useQueryState();
  const firm = useFirmFilter();
  const status = MIGRATION_STATUSES.find((s) => s === q.get("status")) ?? "";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const jobs = useApi<Jobs>(withQuery("/migration/jobs", { status: status || null, organizationId: firm.firmId, limit: LIMIT, offset }), { poll: (d) => (d && d.summary.active > 0 ? 60_000 : undefined) });
  const [open, setOpen] = useState<string | null>(null);
  const s = jobs.data?.summary;

  return (
    <>
      <PageHeader title="Migration" lede="Imports firms run from other systems. Row content and file names are never shown. No actions." />
      {s ? (
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <MetricCard icon={<RefreshCw className="ic" aria-hidden />} label="Active" value={num(s.active)} sub="staged, checked or committing" />
          <MetricCard icon={<CircleAlert className="ic" aria-hidden />} label="Stuck" value={num(s.stuck)} className={s.stuck ? "bad" : undefined} badge={s.stuck ? <Badge tone="bad">committing &gt; {jobs.data?.stuck_after_minutes ?? 30} min</Badge> : null} onClick={() => setQ({ status: "stuck", offset: null })} />
          <MetricCard icon={<Trash2 className="ic" aria-hidden />} label="Purge due" value={num(s.purge_due)} className={s.purge_due ? "warn" : undefined} sub="staged copies past their purge date" />
        </div>
      ) : jobs.error ? null : <div style={{ marginBottom: 12 }}><SkeletonCards n={3} /></div>}
      {s ? (
        <div className="chips" aria-label="Jobs by status">
          {MIGRATION_STATUSES.map((st) => {
            const n = st === "stuck" ? s.stuck : s.by_status[st] ?? 0;
            return <button key={st} type="button" className={`c${status === st ? " on" : st === "stuck" && n ? " b" : ""}`} aria-pressed={status === st} onClick={() => setQ({ status: status === st ? null : st, offset: null })}>{words(st)} <b>{num(n)}</b></button>;
          })}
        </div>
      ) : null}
      <FilterBar active={(status ? 1 : 0) + (firm.firmId ? 1 : 0)}>
        <SelectField id="m-status" label="Status" value={status} onChange={(v) => setQ({ status: v || null, offset: null })} options={MIGRATION_STATUSES.map((v) => ({ value: v, label: words(v) }))} />
        <div className="fld-firm">{firm.field("m-firm")}</div>
      </FilterBar>
      <Panel title="Import jobs" icon={<FolderSync className="ic" aria-hidden />} right={jobs.data ? `${num(jobs.data.total)} ${jobs.data.total === 1 ? "job" : "jobs"}${s?.active ? " · refreshes every minute" : ""}` : null}>
        <Section loaded={jobs} skeleton={<SkeletonRows n={5} />}>
          {(p) => {
            if (!p.items.length) {
              if (status === "stuck" && !firm.firmId) return <Empty tone="ok" title="No stuck imports." />;
              return status || firm.firmId ? <FilteredEmpty onClear={() => setQ({ status: null, firm: null, firmName: null, offset: null })} /> : <Empty title="No import jobs." />;
            }
            return (
              <>
                <div className="tw">
                  <table className="dt mig">
                    <caption className="sr-only">Import jobs</caption>
                    <thead><tr>{["", "Firm", "Kind", "Source", "Status", "Size", "Rows", "Attachments", "Exceptions", "Pilot", "Commit", "Purge after", "Updated"].map((h, i) => <th key={h || i} scope="col">{h || <span className="sr-only">Expand</span>}</th>)}</tr></thead>
                    <tbody>
                      {p.items.map((j) => {
                        const st = migrationStatus(j);
                        const isOpen = open === j.id;
                        const ended = j.rolled_back_at ? `Rolled back ${day(j.rolled_back_at)}` : j.discarded_at ? `Discarded ${day(j.discarded_at)}` : null;
                        return (
                          <Fragment key={j.id}>
                            <tr>
                              <td data-l=""><button type="button" className="btn ghost sm icon" aria-expanded={isOpen} aria-label={isOpen ? "Hide counts" : "Show counts"} onClick={() => setOpen(isOpen ? null : j.id)}>{isOpen ? <ChevronDown className="ic" aria-hidden /> : <ChevronRight className="ic" aria-hidden />}</button></td>
                              <td data-l="" className="first"><b><Link href={`/firms/${j.organization_id}`}>{j.firm_name}</Link></b> <SampleBadge on={j.is_sample} /></td>
                              <td data-l="Kind">{words(j.kind)}</td>
                              <td data-l="Source">{sourceLabel(j.source_system)}</td>
                              <td data-l="Status"><Badge tone={st.tone}>{st.label}</Badge>{j.stuck ? <small>{j.status}</small> : null}</td>
                              <td data-l="Size">{bytes(j.byte_size)}</td>
                              <td data-l="Rows">{num(j.source_row_count)} → {num(j.staged_row_count)}</td>
                              <td data-l="Attachments">{j.attachment_files ? <>{num(j.attachment_files)} files<small>{bytes(j.attachment_bytes)}</small></> : dash}</td>
                              <td data-l="Exceptions">{j.exception_count ? <Badge tone="warn">{num(j.exception_count)}</Badge> : "0"}</td>
                              <td data-l="Pilot">{j.pilot_started_at ? <>{j.pilot_size ? `${num(j.pilot_size)} rows` : "Started"}<small>{j.pilot_signed_off_at ? `Signed off ${day(j.pilot_signed_off_at)}` : j.pilot_completed_at ? `Done ${day(j.pilot_completed_at)}` : `Started ${day(j.pilot_started_at)}`}</small></> : dash}</td>
                              <td data-l="Commit">{ended ? ended : j.committed_at ? <>{day(j.committed_at)}<small>{j.commit_verified_at ? "Verified" : "Not verified"}</small></> : j.commit_started_at ? <>Started<small>{day(j.commit_started_at)} {clock(j.commit_started_at)}</small></> : dash}</td>
                              <td data-l="Purge after">{j.staging_purged_at ? <>Purged<small>{day(j.staging_purged_at)}</small></> : j.purge_after ? (j.purge_due ? <Badge tone="warn">{day(j.purge_after)}</Badge> : day(j.purge_after)) : dash}</td>
                              <td data-l="Updated">{day(j.updated_at)}<small>{clock(j.updated_at)}</small></td>
                            </tr>
                            {isOpen ? (
                              <tr className="expand"><td colSpan={13}>
                                <div className="cols even" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                                  <Counts title="Plan" v={j.plan_counts} />
                                  <Counts title="Pilot" v={j.pilot_counts} />
                                  <Counts title="Result" v={j.result_counts} />
                                </div>
                              </td></tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
              </>
            );
          }}
        </Section>
      </Panel>
      <p className="foot">Stuck = committing for more than {jobs.data?.stuck_after_minutes ?? 30} minutes. Firms stage, check, pilot, commit, roll back and discard in Casevoya; there are no actions here.</p>
    </>
  );
}
