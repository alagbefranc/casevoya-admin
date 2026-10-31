"use client";
import Link from "next/link";
import { useState } from "react";
import { Activity, BadgeCheck, Building2, Clock, CreditCard, FileText, KeyRound, MessageSquareWarning, RefreshCw, ShieldCheck, Siren, Timer } from "@/components/icons";
import { useAdmin } from "@/client/app";
import { useApi } from "@/client/hooks";
import { clock, duration, minutes, num, words, day } from "@/client/format";
import { verificationWorkload } from "@/client/session-rules";
import type { FirmRow, GrantPage, Overview, Page } from "@/client/types";
import { Badge, DataTable, Drawer, Empty, ErrorAlert, MetricCard, PageHeader, Panel, SampleBadge, Section, SkeletonCards, SkeletonRows, StaleLine, Status, statusLabel } from "@/components/ui";

type Sla = { days: number; target_minutes: number; received: number; responded: number; awaiting_response: number; awaiting_over_target: number; within_target: number; breached: number; median_minutes: number | null };
type Complaints = { totals: { open: number; ack_overdue: number; response_overdue: number; total: number }; by_category: Record<string, number>; by_firm: { organization_id: string; firm_name: string; open: number; ack_overdue: number; response_overdue: number }[] };

const QUEUE_TONE = { healthy: "ok", degraded: "warn", unhealthy: "bad" } as const;
const INCIDENT_TONE = { operational: "ok", maintenance: "info", incident: "warn", major_incident: "bad" } as const;

export default function OverviewPage() {
  const { overviewState } = useAdmin();
  const firms = useApi<Page<FirmRow>>("/firms?limit=5");
  const active = useApi<GrantPage>("/support/requests?state=active&limit=10", { poll: (d) => (d && d.items.length ? 30 : 120) });
  const pending = useApi<GrantPage>("/support/requests?state=pending&limit=10", { poll: 30 });
  const sla = useApi<Sla>("/overview/support-sla?days=30&targetMinutes=1440");
  const [complaints, setComplaints] = useState(false);
  const refresh = () => {
    void overviewState.reload();
    void firms.reload();
    void active.reload();
    void pending.reload();
    void sla.reload();
  };

  return (
    <>
      <PageHeader
        title="Operations"
        lede={<>Live counts across every firm.{overviewState.updatedAt ? <> Checked {clock(overviewState.updatedAt)}.</> : null}</>}
        actions={<button type="button" className="btn" onClick={refresh} disabled={overviewState.loading}><RefreshCw className="ic" aria-hidden />Refresh</button>}
      />
      <Section loaded={overviewState} skeleton={<><SkeletonCards n={5} cls="g5" h={128} /><SkeletonCards n={4} cls="g4" h={104} /></>}>
        {(o) => <Cards o={o} sla={sla} onComplaints={() => setComplaints(true)} />}
      </Section>

      <div className="cols even">
        <Panel title="Newest firms" icon={<Building2 className="ic" aria-hidden />} right={<Link href="/firms">All firms</Link>}>
          <Section loaded={firms} skeleton={<SkeletonRows n={5} />}>
            {(page) => page.items.length ? (
              <ul className="gl">
                {page.items.map((f) => (
                  <li key={f.id}>
                    <span className="ki" aria-hidden><Building2 className="ic" /></span>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/firms/${f.id}`}>{f.display_name}</Link> <SampleBadge on={f.sample_mode} />
                      <span className="sub">{words(f.plan) === "—" ? "No plan" : words(f.plan)} · created {day(f.created_at)}</span>
                    </div>
                    <span className="bd"><Status value={f.verification_status} />{f.subscription_status ? <Status value={f.subscription_status} /> : <Badge>No subscription</Badge>}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No firms have signed up yet." />}
          </Section>
        </Panel>

        <Panel title="Support grants" icon={<KeyRound className="ic" aria-hidden />} right={<Link href="/grants">All grants</Link>}>
          <GrantList active={active} pending={pending} />
          <div className="note"><ShieldCheck className="ic" aria-hidden />There is no impersonation button. Client content needs a firm-approved, time-limited support grant.</div>
        </Panel>
      </div>

      {complaints ? <ComplaintsDrawer onClose={() => setComplaints(false)} /> : null}
    </>
  );
}

function Cards({ o, sla, onComplaints }: { o: Overview; sla: ReturnType<typeof useApi<Sla>>; onComplaints: () => void }) {
  const q = o.queues ?? { level: "healthy", counts: {}, oldest_pending_wait_seconds: 0, processing_stuck: 0, failed_last_hour: 0 };
  const counts = q.counts ?? {};
  const workload = verificationWorkload(o);
  const reasons = Object.entries(o.subscriptions?.by_reason ?? {}).filter(([, n]) => n > 0);
  const overdue = (o.complaints?.ack_overdue ?? 0) + (o.complaints?.response_overdue ?? 0);
  const v = o.firms?.by_verification ?? {};
  const total = o.firms?.total ?? 0;
  const queueBar = (["published", "pending", "processing", "failed", "dead_lettered"] as const).map((k) => [k, counts[k] ?? 0] as const);
  const queueTotal = queueBar.reduce((a, [, n]) => a + n, 0);
  const s = sla.data;
  return (
    <>
      <div className="grid g5">
        <MetricCard icon={<Building2 className="ic" aria-hidden />} label="Firms" value={num(total)} href="/firms" sub={`${num(o.firms?.live ?? 0)} live · ${num(o.firms?.sample ?? 0)} sample`}>
          {total ? (
            <>
              <div className="meter" aria-hidden>
                {(["verified", "pending_review", "unverified", "restricted"] as const).map((k) => (v[k] ? <i key={k} className={k === "verified" ? "" : k === "restricted" ? "b" : "l"} style={{ width: `${(v[k] / total) * 100}%` }} /> : null))}
              </div>
              <div className="s">{Object.entries(v).filter(([, n]) => n).map(([k, n]) => `${statusLabel(k)} ${n}`).join(" · ")}</div>
            </>
          ) : null}
        </MetricCard>
        <MetricCard icon={<CreditCard className="ic" aria-hidden />} label="Subscription exceptions" value={num(o.subscriptions?.exceptions ?? 0)} href="/subscriptions" badge={o.subscriptions?.exceptions ? <Badge tone="warn">Needs a look</Badge> : null}>
          {reasons.length ? <div className="reasons">{reasons.map(([k, n]) => <Status key={k} value={k} label={`${statusLabel(k)}${n > 1 ? ` ${n}` : ""}`} tone={k === "past_due" || k === "restricted" || k === "invoice_unpaid" ? "bad" : "warn"} />)}</div> : <div className="s">No firm needs billing attention.</div>}
        </MetricCard>
        <MetricCard className="mfirst" icon={<Activity className="ic" aria-hidden />} label="Queues" word value={statusLabel(q.level)} href="/health" badge={counts.dead_lettered ? <Badge tone="bad">{num(counts.dead_lettered)} dead {counts.dead_lettered === 1 ? "letter" : "letters"}</Badge> : <Badge tone={QUEUE_TONE[q.level as keyof typeof QUEUE_TONE] ?? "neutral"}>{statusLabel(q.level)}</Badge>}
          sub={`${num(counts.pending ?? 0)} pending · ${num(counts.processing ?? 0)} processing${q.oldest_pending_wait_seconds ? ` · oldest ${duration(q.oldest_pending_wait_seconds)}` : ""}`}>
          {queueTotal ? (
            <div className="meter" aria-hidden>
              {queueBar.map(([k, n]) => (n ? <i key={k} className={k === "failed" ? "w" : k === "dead_lettered" ? "b" : k === "published" ? "" : "l"} style={{ width: `${Math.max(2, (n / queueTotal) * 100)}%` }} /> : null))}
            </div>
          ) : null}
        </MetricCard>
        <MetricCard icon={<BadgeCheck className="ic" aria-hidden />} label="Verification workload" value={num(workload)} href="/verification"
          badge={o.licences?.adverse ? <Badge tone="bad">{num(o.licences.adverse)} adverse</Badge> : workload ? <Badge tone="warn">To check</Badge> : null}
          sub={`${num(o.licences?.due ?? 0)} licence ${o.licences?.due === 1 ? "check" : "checks"} due · ${num(o.licences?.needs_review ?? 0)} needs review · ${num(o.verification_workload?.firms_pending_review ?? 0)} firm pending review · ${num(o.licences?.never_checked ?? 0)} never checked`} />
        <MetricCard className="mfirst" icon={<Siren className="ic" aria-hidden />} label="Incident status" word value={statusLabel(o.incidents?.status ?? "operational")} href="/incidents"
          badge={<Badge tone={INCIDENT_TONE[(o.incidents?.status ?? "operational") as keyof typeof INCIDENT_TONE] ?? "neutral"}>{o.incidents?.active ? `${num(o.incidents.active)} active` : "No active notices"}</Badge>}
          sub={o.incidents?.worst_severity ? `Worst severity: ${statusLabel(o.incidents.worst_severity)}` : undefined} />
      </div>
      <div className="grid g4">
        <MetricCard icon={<KeyRound className="ic" aria-hidden />} label="Support grants" value={`${num(o.support?.active ?? 0)} active`} href="/grants"
          badge={o.support?.pending ? <Badge tone="warn">{num(o.support.pending)} pending</Badge> : o.support?.active ? <Badge tone="info">In use</Badge> : null} />
        <MetricCard icon={<FileText className="ic" aria-hidden />} label="Templates awaiting review" value={num(o.templates?.awaiting_review ?? 0)} href="/releases?tab=templates"
          badge={o.templates?.awaiting_review ? <Badge tone="warn">To review</Badge> : null} sub={`${num(o.templates?.published ?? 0)} published`} />
        <MetricCard icon={<MessageSquareWarning className="ic" aria-hidden />} label="Complaints overdue" value={num(overdue)} onClick={onComplaints}
          badge={overdue ? <Badge tone="bad">Overdue</Badge> : null}
          sub={`${num(o.complaints?.ack_overdue ?? 0)} acknowledgement · ${num(o.complaints?.response_overdue ?? 0)} response · by firm ›`} />
        <MetricCard icon={<Timer className="ic" aria-hidden />} label="Support response time" value={s ? (s.median_minutes === null ? "—" : minutes(s.median_minutes)) : sla.error ? "—" : "…"}
          badge={s?.awaiting_over_target ? <Badge tone="warn">{num(s.awaiting_over_target)} over target</Badge> : null}
          sub={s ? `Median first response · ${num(s.breached)} of ${num(s.received)} over ${minutes(s.target_minutes)} (${s.days} d)` : sla.error ? "Response times could not be loaded." : "Loading…"} />
      </div>
    </>
  );
}

function GrantList({ active, pending }: { active: ReturnType<typeof useApi<GrantPage>>; pending: ReturnType<typeof useApi<GrantPage>> }) {
  if (!active.data || !pending.data) {
    const error = active.error ?? pending.error;
    if (error) return <div className="pad"><ErrorAlert error={error} onRetry={() => { void active.reload(); void pending.reload(); }} /></div>;
    return <SkeletonRows n={3} />;
  }
  const rows = [...active.data.items, ...pending.data.items];
  return (
    <>
      <StaleLine loaded={active.stale ? active : pending} />
      {rows.length ? (
        <ul className="gl">
          {rows.map((g) => {
            const isActive = g.effective_status === "approved" || g.state === "active";
            return (
              <li key={g.id}>
                <span className="ki" aria-hidden><KeyRound className="ic" /></span>
                <div style={{ minWidth: 0 }}>
                  <Link href={`/grants/${g.id}`}>{g.firm_name ?? "Unknown firm"}</Link>
                  <span className="sub">{g.scope === "firm_settings" ? "firm settings" : `matter ${g.matter_id?.slice(0, 8) ?? ""}`}{g.ticket_ref ? ` · ${g.ticket_ref}` : ""}{g.requested_by_name ? ` · ${g.requested_by_name}` : ""}</span>
                </div>
                <span className="bd">
                  {isActive ? <Badge tone="ok">Active</Badge> : <Status value={g.effective_status} />}
                  {isActive && g.minutes_left !== null ? <span className="muted"><Clock className="ic" aria-hidden style={{ verticalAlign: -3 }} /> {g.minutes_left} min left</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : <Empty title="No support access is pending or active." />}
    </>
  );
}

function ComplaintsDrawer({ onClose }: { onClose: () => void }) {
  const data = useApi<Complaints>("/overview/complaints");
  return (
    <Drawer open title="Complaints by firm" onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>Counts only. Complaint text stays in each firm&apos;s Casevoya.</p>
      <Section loaded={data} skeleton={<SkeletonRows n={4} />}>
        {(c) => (
          <>
            <dl className="dl">
              <div><dt>Open</dt><dd>{num(c.totals.open)}</dd></div>
              <div><dt>Total</dt><dd>{num(c.totals.total)}</dd></div>
              <div><dt>Acknowledgement overdue</dt><dd>{num(c.totals.ack_overdue)}</dd></div>
              <div><dt>Response overdue</dt><dd>{num(c.totals.response_overdue)}</dd></div>
            </dl>
            {c.by_firm.length ? (
              <DataTable caption="Complaints by firm" rowKey={(r) => r.organization_id} rows={c.by_firm} columns={[
                { key: "firm", label: "Firm", first: true, render: (r) => <Link href={`/firms/${r.organization_id}`}>{r.firm_name}</Link> },
                { key: "open", label: "Open", render: (r) => num(r.open) },
                { key: "ack", label: "Ack overdue", render: (r) => (r.ack_overdue ? <Badge tone="bad">{num(r.ack_overdue)}</Badge> : "0") },
                { key: "resp", label: "Response overdue", render: (r) => (r.response_overdue ? <Badge tone="bad">{num(r.response_overdue)}</Badge> : "0") },
              ]} />
            ) : <Empty tone="ok" title="No firm has open complaints." />}
            {Object.keys(c.by_category).length ? (
              <div><h3>By category</h3><div className="badges">{Object.entries(c.by_category).map(([k, n]) => <Badge key={k}>{words(k)} · {n}</Badge>)}</div></div>
            ) : null}
          </>
        )}
      </Section>
    </Drawer>
  );
}
