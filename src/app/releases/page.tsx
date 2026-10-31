"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Layers, Plus, Rocket, ShieldCheck, StickyNote } from "@/components/icons";
import { withQuery } from "@/client/api";
import { CanOperate, useAdmin } from "@/client/app";
import { useApi, useQueryState } from "@/client/hooks";
import { day, num, when } from "@/client/format";
import { DraftForm } from "@/client/releases";
import type { Page, Stub } from "@/client/types";
import { Badge, DataTable, Empty, PageHeader, Pager, Panel, Section, SkeletonRows, Status, StubPanel, Tabs } from "@/components/ui";

type Release = { version_id: string; template_id: string; stable_key: string; title: string; version_number: number; status: string; effective_on: string | null; published_at: string | null; reviewed_at: string | null; reviewer_label: string | null; author_name: string | null; changelog: string | null; adopting_firms: number };
type Template = {
  id: string; stable_key: string; title: string; updated_at: string;
  published: null | { id: string; version_number: number; published_at: string | null; reviewer_label: string | null };
  draft: null | { id: string; version_number: number; author_name: string | null; author_user_id: string | null; created_at: string; effective_on: string | null; sources: number; official_sources: number };
  adopted_by_firms: number;
};
const LIMIT = 50;

export default function ReleasesPage() {
  const [q, setQ] = useQueryState();
  const tab = q.get("tab") === "templates" ? "templates" : q.get("tab") === "notes" ? "notes" : "releases";
  const [draft, setDraft] = useState<null | { key: string; title: string } | "new">(null);
  return (
    <>
      <PageHeader title="Releases" lede="Shared template versions firms adopt. Every version is reviewed by a second admin before it publishes."
        actions={<CanOperate><button type="button" className="btn primary" onClick={() => setDraft("new")}><Plus className="ic" aria-hidden />New draft</button></CanOperate>} />
      <Tabs current={tab} items={[
        { key: "releases", label: "Template releases", href: "/releases" },
        { key: "templates", label: "Templates", href: "/releases?tab=templates" },
        { key: "notes", label: "App release notes", href: "/releases?tab=notes" },
      ]} />
      {tab === "releases" ? <ReleasesTab offset={Number(q.get("offset") ?? 0) || 0} onOffset={(o) => setQ({ offset: o ? String(o) : null })} /> : null}
      {tab === "templates" ? <TemplatesTab onDraft={(t) => setDraft(t)} /> : null}
      {tab === "notes" ? <NotesTab /> : null}
      {draft ? <DraftForm revise={null} startKey={draft === "new" ? null : draft} onClose={() => setDraft(null)} /> : null}
    </>
  );
}

function ReleasesTab({ offset, onOffset }: { offset: number; onOffset: (o: number) => void }) {
  const router = useRouter();
  const releases = useApi<Page<Release>>(withQuery("/releases/templates", { limit: LIMIT, offset }));
  return (
    <Panel title="Template releases" icon={<Rocket className="ic" aria-hidden />}>
      <Section loaded={releases} skeleton={<SkeletonRows n={4} />}>
        {(page) => (
          <>
            <DataTable caption="Template releases" rows={page.items} rowKey={(r) => r.version_id} onRowClick={(r) => router.push(`/releases/templates/${r.version_id}`)}
              empty={<Empty title="Nothing has been published to firms yet." />}
              columns={[
                { key: "t", label: "Template", first: true, render: (r) => <><b><Link href={`/releases/templates/${r.version_id}`}>{r.title}</Link></b><small className="mono">{r.stable_key}</small></> },
                { key: "v", label: "Version", render: (r) => `v${r.version_number}` },
                { key: "s", label: "Status", render: (r) => <Status value={r.status} /> },
                { key: "e", label: "Effective on", render: (r) => day(r.effective_on) },
                { key: "p", label: "Published", render: (r) => when(r.published_at) },
                { key: "rv", label: "Reviewer", render: (r) => r.reviewer_label ?? "—" },
                { key: "a", label: "Author", render: (r) => r.author_name ?? "—" },
                { key: "f", label: "Adopting firms", render: (r) => num(r.adopting_firms) },
                { key: "c", label: "Changelog", render: (r) => (r.changelog ?? "—").split("\n")[0] },
              ]} />
            <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={onOffset} />
          </>
        )}
      </Section>
    </Panel>
  );
}

function TemplatesTab({ onDraft }: { onDraft: (t: { key: string; title: string }) => void }) {
  const router = useRouter();
  const { me } = useAdmin();
  const templates = useApi<{ templates: Template[] }>("/templates");
  const domains = useApi<{ items: { host: string; match_kind: string; authority: string }[] }>("/templates/official-domains");
  return (
    <>
      <Panel title="Templates" icon={<Layers className="ic" aria-hidden />}>
        <Section loaded={templates} skeleton={<SkeletonRows n={4} />}>
          {({ templates: rows }) => (
            <DataTable caption="Templates" rows={rows} rowKey={(t) => t.id} onRowClick={(t) => { const id = t.draft?.id ?? t.published?.id; if (id) router.push(`/releases/templates/${id}`); }}
              empty={<Empty title="No shared templates yet.">Write the first draft.</Empty>}
              columns={[
                { key: "t", label: "Template", first: true, render: (t) => <><b>{t.title}</b><small className="mono">{t.stable_key}</small></> },
                { key: "p", label: "Published", render: (t) => (t.published ? <>v{t.published.version_number}<small>{day(t.published.published_at)}{t.published.reviewer_label ? ` · ${t.published.reviewer_label}` : ""}</small></> : "—") },
                { key: "d", label: "Draft", render: (t) => (t.draft ? <>v{t.draft.version_number}{t.draft.author_name ? ` by ${t.draft.author_name}` : ""}<small>{day(t.draft.created_at)} · {t.draft.sources} sources · {t.draft.official_sources ? `${t.draft.official_sources} official` : <span style={{ color: "var(--warn)" }}>0 official</span>}</small></> : "—") },
                { key: "s", label: "Status", render: (t) => (t.draft ? <Badge tone="warn">Awaiting review</Badge> : t.published ? <Status value="published" /> : <Badge>No version</Badge>) },
                { key: "f", label: "Adopted by", render: (t) => `${num(t.adopted_by_firms)} firms` },
                { key: "a", label: "", render: (t) => (
                  t.draft && me.capabilities.reviewTemplates ? <Link className="btn sm" href={`/releases/templates/${t.draft.id}`}>Review</Link>
                    : !t.draft && me.capabilities.operate ? <button type="button" className="btn sm" onClick={() => onDraft({ key: t.stable_key, title: t.title })}>New draft</button> : null
                ) },
              ]} />
          )}
        </Section>
      </Panel>
      <Panel title="Official sources we accept" icon={<ShieldCheck className="ic" aria-hidden />}>
        <div className="pad">
          <Section loaded={domains} skeleton={<SkeletonRows n={1} />}>
            {(d) => (
              <details>
                <summary style={{ cursor: "pointer" }}>{d.items.length} allowed domains. Changes to this list happen in the database, not here.</summary>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {d.items.map((x) => <li key={x.host}><span className="mono">{x.host}</span> <span className="muted">({x.match_kind}) · {x.authority}</span></li>)}
                </ul>
              </details>
            )}
          </Section>
        </div>
      </Panel>
    </>
  );
}

function NotesTab() {
  const notes = useApi<Stub>("/releases/app-notes");
  return (
    <Panel title="App release notes" icon={<StickyNote className="ic" aria-hidden />}>
      <div className="pad">
        <Section loaded={notes} skeleton={<SkeletonRows n={1} />}>
          {(d) => <StubPanel gap={d.gap} />}
        </Section>
      </div>
    </Panel>
  );
}
