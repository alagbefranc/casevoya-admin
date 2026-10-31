"use client";
import Link from "next/link";
import { useState } from "react";
import { Megaphone, Plus, Siren } from "@/components/icons";
import { withQuery } from "@/client/api";
import { CanOperate } from "@/client/app";
import { useApi, useQueryState } from "@/client/hooks";
import { duration, plural, when, words } from "@/client/format";
import { NoticeDrawer, NoticeForm, PhaseBadge, audienceText, type Notice } from "@/client/notices";
import type { Page } from "@/client/types";
import { Alert, DataTable, Empty, FilterBar, FilteredEmpty, PageHeader, Pager, Panel, Section, SelectField, SkeletonRows, Status, Tabs } from "@/components/ui";

type Incidents = Page<Notice> & {
  current: { status: { active: number; active_incidents: number; worst_severity: string | null; status: string }; queues: { level: string; counts: Record<string, number> } };
};
const LIMIT = 50;

export default function IncidentsPage() {
  const [q, setQ] = useQueryState();
  const tab = q.get("tab") === "notices" ? "notices" : "log";
  const state = q.get("state") ?? "";
  const kind = q.get("kind") ?? "";
  const status = q.get("status") ?? "";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const open = q.get("notice");
  const post = q.get("post");
  const [editing, setEditing] = useState<Notice | null>(null);
  const incidents = useApi<Incidents>(withQuery("/incidents", { state: tab === "log" ? state : "", kind: tab === "log" ? kind : "", limit: LIMIT, offset: tab === "log" ? offset : 0 }), { poll: 60_000 });
  const notices = useApi<Page<Notice>>(tab === "notices" ? withQuery("/notices", { status, limit: LIMIT, offset }) : null);
  const cur = incidents.data?.current;
  const ended = (incidents.data?.items ?? []).filter((n) => n.phase === "ended");
  const dead = cur?.queues.counts?.dead_lettered ?? 0;

  const columns = (withKind: boolean) => [
    { key: "t", label: "Title", first: true, render: (n: Notice) => <b>{n.title}</b> },
    ...(withKind ? [{ key: "k", label: "Kind", render: (n: Notice) => words(n.kind) }] : [{ key: "k", label: "Kind", render: (n: Notice) => words(n.kind) }]),
    { key: "s", label: "Severity", render: (n: Notice) => words(n.severity) },
    { key: "p", label: "Phase", render: (n: Notice) => <PhaseBadge n={n} /> },
    { key: "st", label: "Started", render: (n: Notice) => when(n.starts_at ?? n.published_at) },
    { key: "r", label: "Resolved", render: (n: Notice) => when(n.resolved_at) },
    { key: "d", label: "Duration", render: (n: Notice) => (n.duration_minutes != null ? duration(n.duration_minutes * 60) : n.phase === "live" || n.phase === "ended" ? "Ongoing" : "—") },
    { key: "a", label: "Audience", render: (n: Notice) => audienceText(n) },
  ];

  return (
    <>
      <PageHeader
        title="Incidents"
        badge={cur ? <Status value={cur.status.status} /> : null}
        lede={cur ? <>{cur.status.active ? `${plural(cur.status.active, "active notice")}. ` : ""}Queues: <Link href="/health"><Status value={cur.queues.level} /></Link>{dead ? ` (${plural(dead, "dead letter")})` : ""}. What firms see in Casevoya&apos;s status banner.</> : "What firms see in Casevoya's status banner."}
        actions={<CanOperate><button type="button" className="btn primary" onClick={() => setQ({ post: "" })}><Plus className="ic" aria-hidden />Post a notice</button></CanOperate>}
      />
      {ended.map((n) => (
        <Alert key={n.id} tone="warn" title={`“${n.title}” ended but isn't resolved`} actions={<button type="button" className="linkbtn" onClick={() => setQ({ notice: n.id })}>Resolve it</button>}>Firms still see it as ongoing.</Alert>
      ))}
      <Tabs current={tab} items={[{ key: "log", label: "Incident log", href: "/incidents" }, { key: "notices", label: "Notices", href: "/incidents?tab=notices" }]} />
      {tab === "log" ? (
        <>
          <FilterBar active={[state, kind].filter(Boolean).length}>
            <SelectField id="i-state" label="State" value={state} onChange={(v) => setQ({ state: v })} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }]} />
            <SelectField id="i-kind" label="Kind" value={kind} all="Incidents" onChange={(v) => setQ({ kind: v })} options={[{ value: "maintenance", label: "Maintenance" }, { value: "both", label: "Both" }]} />
          </FilterBar>
          <Panel title="Incident log" icon={<Siren className="ic" aria-hidden />}>
            <Section loaded={incidents} skeleton={<SkeletonRows n={4} />}>
              {(page) => (
                <>
                  <DataTable caption="Incident log" rows={page.items} rowKey={(n) => n.id} onRowClick={(n) => setQ({ notice: n.id, offset: offset ? String(offset) : null })} columns={columns(true)}
                    empty={state || kind ? <FilteredEmpty onClear={() => setQ({ state: null, kind: null })} /> : <Empty title="No incidents recorded.">Post a notice when something affects firms.</Empty>} />
                  <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
                </>
              )}
            </Section>
          </Panel>
        </>
      ) : (
        <>
          <FilterBar active={status ? 1 : 0}>
            <SelectField id="n-status" label="Status" value={status} onChange={(v) => setQ({ status: v })} options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "resolved", label: "Resolved" }]} />
          </FilterBar>
          <Panel title="Notices" icon={<Megaphone className="ic" aria-hidden />}>
            <Section loaded={notices} skeleton={<SkeletonRows n={4} />}>
              {(page) => (
                <>
                  <DataTable caption="Notices" rows={page.items} rowKey={(n) => n.id} onRowClick={(n) => setQ({ notice: n.id, offset: offset ? String(offset) : null })} columns={columns(true)}
                    empty={status ? <FilteredEmpty onClear={() => setQ({ status: null })} /> : <Empty title="No notices yet." />} />
                  <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
                </>
              )}
            </Section>
          </Panel>
        </>
      )}
      {open ? <NoticeDrawer id={open} onClose={() => setQ({ notice: null, offset: offset ? String(offset) : null })} onEdit={(n) => { setEditing(n); setQ({ notice: null, offset: offset ? String(offset) : null }); }} /> : null}
      {post !== null || editing ? <NoticeForm editing={editing} prefillFirm={post || null} onClose={() => { setEditing(null); if (post !== null) setQ({ post: null }); }} /> : null}
    </>
  );
}
