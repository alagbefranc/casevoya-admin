"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "@/components/icons";
import { withQuery } from "@/client/api";
import { CanOperate } from "@/client/app";
import { Countdown, RequestAccessDrawer } from "@/client/grants";
import { useApi, useQueryState } from "@/client/hooks";
import { num, short, when } from "@/client/format";
import type { GrantPage } from "@/client/types";
import { DataTable, Empty, PageHeader, Pager, Panel, Section, SkeletonRows, Status, Tabs } from "@/components/ui";

const LIMIT = 50;
const EMPTY: Record<string, [string, string]> = {
  pending: ["No requests waiting for a firm.", "Request access from a firm's page or with Request access."],
  active: ["No one has support access right now.", "Approved requests show here with their countdown."],
  closed: ["No closed requests.", "Declined, cancelled, ended and expired requests show here."],
  all: ["No support requests yet.", "Ask a firm for time-limited access to help with a ticket."],
};

export default function GrantsPage() {
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const state = q.get("state") ?? "pending";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const requestFor = q.get("request");
  const live = (d: GrantPage | null) => (d && (d.counts.pending > 0 || d.counts.active > 0) ? 30_000 : 120_000);
  const grants = useApi<GrantPage>(withQuery("/support/requests", { state: state === "all" ? "" : state, limit: LIMIT, offset }), { poll: live });
  const c = grants.data?.counts;
  const tab = (key: string, label: string, n?: number) => ({ key, label: n === undefined ? label : `${label} (${n})`, href: key === "pending" ? "/grants" : `/grants?state=${key}` });

  return (
    <>
      <PageHeader
        title="Grants"
        lede="Firm-approved, time-limited support access. There is no impersonation."
        actions={<CanOperate><button type="button" className="btn primary" onClick={() => setQ({ request: "" })}><KeyRound className="ic" aria-hidden />Request access</button></CanOperate>}
      />
      <Tabs current={state} items={[tab("pending", "Pending", c?.pending), tab("active", "Active", c?.active), tab("closed", "Closed", c?.closed), tab("all", "All", c ? c.pending + c.active + c.closed : undefined)]} />
      <Panel title="Support access" icon={<KeyRound className="ic" aria-hidden />}>
        <Section loaded={grants} skeleton={<SkeletonRows n={4} />}>
          {(page) => (
            <>
              <DataTable
                caption="Support access requests"
                rows={page.items}
                rowKey={(g) => g.id}
                onRowClick={(g) => router.push(`/grants/${g.id}`)}
                empty={<Empty title={(EMPTY[state] ?? EMPTY.all)[0]}>{(EMPTY[state] ?? EMPTY.all)[1]}</Empty>}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (g) => <b><Link href={`/grants/${g.id}`}>{g.firm_name ?? short(g.organization_id)}</Link></b> },
                  { key: "scope", label: "Scope", render: (g) => <span className="mono">{g.scope}</span> },
                  { key: "matter", label: "Matter id", render: (g) => (g.matter_id ? <span className="mono" title={g.matter_id}>{short(g.matter_id)}</span> : "—") },
                  { key: "ticket", label: "Ticket", render: (g) => g.ticket_ref ?? "—" },
                  { key: "by", label: "Requested by", render: (g) => g.requested_by_name ?? g.requested_by_email ?? "—" },
                  { key: "min", label: "Minutes asked", render: (g) => num(g.requested_minutes) },
                  { key: "status", label: "Status", render: (g) => <Status value={g.state === "active" ? "active" : g.effective_status} /> },
                  { key: "appr", label: "Approved", render: (g) => when(g.approved_at) },
                  { key: "ends", label: "Ends", render: (g) => (g.state === "active" ? <Countdown grant={g} /> : when(g.ends_at ?? g.ended_at)) },
                  { key: "ext", label: "Extensions", render: (g) => num(g.extension_count ?? 0) },
                  { key: "uses", label: "Uses", render: (g) => num(g.uses ?? 0) },
                ]}
              />
              <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
      {requestFor !== null ? <RequestAccessDrawer firmId={requestFor || null} onClose={() => setQ({ request: null })} /> : null}
    </>
  );
}
