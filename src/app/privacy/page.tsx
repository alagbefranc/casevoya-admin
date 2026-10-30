"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, CheckCircle2, Clock, Inbox, ShieldCheck } from "lucide-react";
import { withQuery } from "@/client/api";
import { useFirmFilter } from "@/client/firm-filter";
import { useApi, useQueryState } from "@/client/hooks";
import { dash, day, num, words } from "@/client/format";
import { PRIVACY_STAGES, daysLeftText, daysLeftTone, stageIndex } from "@/client/records";
import { Alert, Badge, DataTable, Empty, FilterBar, FilteredEmpty, MetricCard, PageHeader, Pager, Panel, SampleBadge, Section, Seg, SkeletonCards, SkeletonRows, StubPanel, Tabs } from "@/components/ui";

type Req = { id: string; organization_id: string; firm_name: string; reference: string; kind: string; channel: string | null; received_on: string; due_on: string; extended_due_on: string | null; effective_due_on: string; target_days: number; days_left: number | null; overdue: boolean; due_soon: boolean; stage: string; assigned: boolean; outcome: string | null; closed_at: string | null; is_sample: boolean };
type Summary = { open: number; overdue: number; due_soon: number; closed_30d: number; open_by_kind: Record<string, number> };
type Requests = { items: Req[]; total: number; summary: Summary; due_soon_days: number; limit: number; offset: number };
type Breaches = { items: unknown[]; total: number; stub: true; gap: string };
const STATES = ["open", "overdue", "due_soon", "closed", "all"] as const;
type State = (typeof STATES)[number];
const KINDS = ["access", "correction", "consent_withdrawal", "deletion"];
const LIMIT = 50;

export default function PrivacyPage() {
  const [q] = useQueryState();
  const tab = q.get("tab") === "breaches" ? "breaches" : "requests";
  return (
    <>
      <PageHeader title="Privacy" lede="Privacy requests firms are handling, with legal due dates. Read-only: firms answer requests themselves." />
      <Tabs current={tab} items={[{ key: "requests", label: "Requests", href: "/privacy" }, { key: "breaches", label: "Breach register", href: "/privacy?tab=breaches" }]} />
      {tab === "breaches" ? <BreachTab /> : <RequestsTab />}
    </>
  );
}

function BreachTab() {
  const b = useApi<Breaches>("/privacy/breaches");
  return <Section loaded={b} skeleton={<SkeletonRows n={2} />}>{(d) => <StubPanel title="Breach register" gap={d.gap} />}</Section>;
}

function RequestsTab() {
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const firm = useFirmFilter();
  const state: State = STATES.find((s) => s === q.get("state")) ?? "open";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const reqs = useApi<Requests>(withQuery("/privacy/requests", { state: state === "open" ? null : state, organizationId: firm.firmId, limit: LIMIT, offset }));
  const d = reqs.data;
  const s = d?.summary;
  const soon = d?.due_soon_days ?? 5;

  return (
    <>
      {s ? (
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <MetricCard icon={<Inbox className="ic" aria-hidden />} label="Open" value={num(s.open)} onClick={() => setQ({ state: null, offset: null })} />
          <MetricCard icon={<AlarmClock className="ic" aria-hidden />} label="Overdue" value={num(s.overdue)} className={s.overdue ? "bad" : undefined} badge={s.overdue ? <Badge tone="bad">past due</Badge> : null} onClick={() => setQ({ state: "overdue", offset: null })} />
          <MetricCard icon={<Clock className="ic" aria-hidden />} label={`Due in ${soon} days`} value={num(s.due_soon)} className={s.due_soon ? "warn" : undefined} onClick={() => setQ({ state: "due_soon", offset: null })} />
          <MetricCard icon={<CheckCircle2 className="ic" aria-hidden />} label="Closed (30 d)" value={num(s.closed_30d)} onClick={() => setQ({ state: "closed", offset: null })} />
        </div>
      ) : reqs.error ? null : <div style={{ marginBottom: 12 }}><SkeletonCards n={4} /></div>}
      {s ? (
        <div className="chips" aria-label="Open by kind">
          {[...KINDS, ...Object.keys(s.open_by_kind).filter((k) => !KINDS.includes(k))].map((k) => <span key={k} className="c">{words(k)} <b>{num(s.open_by_kind[k] ?? 0)}</b></span>)}
        </div>
      ) : null}
      <FilterBar active={(state !== "open" ? 1 : 0) + (firm.firmId ? 1 : 0)}>
        <div className="fld">
          <span className="lab">State</span>
          <Seg label="Request state" value={state} onChange={(v) => setQ({ state: v === "open" ? null : v, offset: null })} options={STATES.map((v) => ({
            value: v,
            label: <>{v === "due_soon" ? "Due soon" : words(v)}{s && v !== "all" ? <span className="n"> {num(v === "closed" ? s.closed_30d : s[v])}</span> : null}</>,
          }))} />
        </div>
        <div className="fld-firm">{firm.field("p-firm")}</div>
      </FilterBar>
      <Panel title="Requests" icon={<ShieldCheck className="ic" aria-hidden />} right={d ? `${num(d.total)} ${d.total === 1 ? "request" : "requests"}` : null}>
        <Section loaded={reqs} skeleton={<SkeletonRows n={5} />}>
          {(p) => (
            <>
              <DataTable caption="Privacy requests" rows={p.items} rowKey={(r) => r.id} onRowClick={(r) => router.push(`/firms/${r.organization_id}`)}
                empty={firm.firmId ? <FilteredEmpty onClear={() => setQ({ firm: null, firmName: null, offset: null })} />
                  : state === "overdue" ? <div className="pad"><Alert tone="ok">Nothing overdue.</Alert></div>
                  : state === "open" ? <Empty tone="ok" title="No open privacy requests across firms." />
                  : <Empty title="No privacy requests here." />}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (r) => <><b><Link href={`/firms/${r.organization_id}`}>{r.firm_name}</Link></b> <SampleBadge on={r.is_sample} /></> },
                  { key: "ref", label: "Reference", render: (r) => <span className="mono">{r.reference}</span> },
                  { key: "kind", label: "Kind", render: (r) => words(r.kind) },
                  { key: "channel", label: "Channel", render: (r) => (r.channel ? words(r.channel) : dash) },
                  { key: "recv", label: "Received", render: (r) => day(r.received_on) },
                  { key: "due", label: "Due", render: (r) => <>{day(r.effective_due_on)}{r.extended_due_on ? <small>extended</small> : null}</> },
                  { key: "left", label: "Days left", render: (r) => {
                    const closed = Boolean(r.closed_at) || r.stage === "closed";
                    const tone = daysLeftTone(r.days_left, closed, soon);
                    return tone ? <Badge tone={tone}>{daysLeftText(r.days_left, closed)}</Badge> : daysLeftText(r.days_left, closed);
                  } },
                  { key: "stage", label: "Stage", render: (r) => {
                    const at = stageIndex(r.stage);
                    return <span className="nowrap" title={`Step ${at} of ${PRIVACY_STAGES.length}`}><span className="stepper" aria-hidden>{PRIVACY_STAGES.map((st, i) => <i key={st} className={i < at ? "on" : undefined} />)}</span>{words(r.stage)}</span>;
                  } },
                  { key: "assigned", label: "Assigned", render: (r) => (r.assigned ? "Yes" : "No") },
                  { key: "outcome", label: "Outcome", render: (r) => (r.outcome ? words(r.outcome) : dash) },
                ]} />
              <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
      <p className="foot">Metadata only: never the requester, the request details or notes. Due dates count in Toronto time. Admins cannot open or change a firm&apos;s request.</p>
    </>
  );
}
