"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight } from "lucide-react";
import { withQuery } from "@/client/api";
import { useApi, useQueryState } from "@/client/hooks";
import { day, num, words } from "@/client/format";
import { keyDate, type SubscriptionException } from "@/client/billing";
import { Alert, Badge, DataTable, FilteredEmpty, PageHeader, Pager, Panel, SampleBadge, Section, SkeletonRows, Status, Tabs, exceptionTone, statusLabel } from "@/components/ui";
import { FirmsTable } from "@/client/firms-table";

type Exceptions = { items: SubscriptionException[]; total: number; limit: number; offset: number; by_reason: Record<string, number>; by_status: Record<string, number> };
const REASONS = ["past_due", "invoice_unpaid", "restricted", "trial_ending", "trial_ended", "cancel_scheduled"];
const LIMIT = 100;

export default function SubscriptionsPage() {
  const [q, setQ] = useQueryState();
  const tab = q.get("tab") === "all" ? "all" : "exceptions";
  const reason = q.get("reason") ?? "";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const router = useRouter();
  // The summary chips always describe every exception, so they come from an unfiltered call.
  const summary = useApi<Exceptions>("/subscriptions/exceptions?limit=1");
  const list = useApi<Exceptions>(tab === "exceptions" ? withQuery("/subscriptions/exceptions", { reason, limit: LIMIT, offset }) : null);
  const s = summary.data;
  const allCount = s ? Object.values(s.by_status).reduce((a, b) => a + b, 0) : null;

  return (
    <>
      <PageHeader title="Subscriptions" lede="Firms whose billing needs attention. Billing changes happen in Stripe, not here." />
      {s ? (
        <>
          <div className="chips scroll" aria-label="Firms by subscription status">
            {Object.entries(s.by_status).map(([k, n]) => <span key={k} className={`c ${statusTone(k)}`}>{statusLabel(k)} <b>{num(n)}</b></span>)}
          </div>
          <div className="chips scroll" role="group" aria-label="Filter exceptions by reason">
            {REASONS.filter((r) => s.by_reason[r]).map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} className={`c ${reason === r ? "on" : exceptionTone(r) === "bad" ? "b" : "w"}`} onClick={() => setQ({ reason: reason === r ? null : r, offset: null, tab: null })}>
                {statusLabel(r)} <b>{num(s.by_reason[r])}</b>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <Tabs current={tab} items={[
        { key: "exceptions", label: <>Exceptions{s ? ` (${s.total})` : ""}</>, href: "/subscriptions" },
        { key: "all", label: <>All firms{allCount !== null ? ` (${allCount})` : ""}</>, href: "/subscriptions?tab=all" },
      ]} />
      {tab === "all" ? <AllFirms /> : (
        <Panel title="Exceptions" icon={<AlertCircle className="ic" aria-hidden />} right={list.data ? `${num(list.data.total)} ${list.data.total === 1 ? "firm" : "firms"}` : null}>
          <Section loaded={list} skeleton={<SkeletonRows n={5} />}>
            {(p) => (
              <>
                <DataTable
                  caption="Subscription exceptions"
                  rows={p.items}
                  rowKey={(r) => r.organization_id}
                  onRowClick={(r) => router.push(`/firms/${r.organization_id}#subscription`)}
                  empty={reason ? <FilteredEmpty onClear={() => setQ({ reason: null, offset: null })} /> : <div style={{ padding: 16 }}><Alert tone="ok">No subscription exceptions. Every firm&apos;s billing is in order.</Alert></div>}
                  columns={[
                    { key: "firm", label: "Firm", first: true, render: (r) => <><b><Link href={`/firms/${r.organization_id}`}>{r.firm_name}</Link></b> <SampleBadge on={r.sample_mode} /></> },
                    { key: "status", label: "Status", render: (r) => <Status value={r.status} /> },
                    { key: "plan", label: "Plan · interval", render: (r) => [r.plan && words(r.plan), r.billing_interval && words(r.billing_interval)].filter(Boolean).join(" · ") || "—" },
                    { key: "reasons", label: "Reasons", render: (r) => <span className="badges">{r.reasons.map((x) => <Badge key={x} tone={exceptionTone(x)}>{statusLabel(x)}</Badge>)}</span> },
                    { key: "date", label: "Key date", render: (r) => keyDate(r) ?? "—" },
                    { key: "invoice", label: "Latest invoice", render: (r) => (r.latest_invoice_status ? <Status value={r.latest_invoice_status} /> : "—") },
                    { key: "stripe", label: "Stripe", render: (r) => (r.stripe_customer_id ? <a className="icon-link" href={`https://dashboard.stripe.com/customers/${encodeURIComponent(r.stripe_customer_id)}`} target="_blank" rel="noreferrer noopener" aria-label={`Open ${r.firm_name} in Stripe`}><ArrowUpRight size={16} aria-hidden /></a> : "—") },
                    { key: "updated", label: "Updated", render: (r) => day(r.updated_at) },
                  ]}
                />
                <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
              </>
            )}
          </Section>
        </Panel>
      )}
    </>
  );
}

function statusTone(k: string): string {
  return k === "past_due" || k === "restricted" ? "b" : k === "trial_ended" ? "w" : "";
}

/** "All firms by subscription" reuses the Firms table and its Subscription filter (spec 2.3). */
function AllFirms() {
  return <FirmsTable embedded />;
}
