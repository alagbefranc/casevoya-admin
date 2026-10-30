"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, AlertCircle, BadgeCheck, Building2, FileSpreadsheet, ShieldX, Upload } from "lucide-react";
import { withQuery } from "@/client/api";
import { CanOperate } from "@/client/app";
import { useApi, useQueryState } from "@/client/hooks";
import { day, dash, num, short, when, words } from "@/client/format";
import { CiccUploadDrawer, methodLabel } from "@/client/licences";
import { QUEUE_KINDS, type QueueKind } from "@/client/licence-rules";
import { FirmsTable } from "@/client/firms-table";
import type { Page } from "@/client/types";
import { Alert, Badge, DataTable, Empty, MetricCard, PageHeader, Pager, Panel, SampleBadge, Section, Seg, SkeletonCards, SkeletonRows, Status, Tabs, statusLabel, statusTone } from "@/components/ui";

type Summary = {
  firmsByVerification: Record<string, number>;
  licenceCounts: Record<string, number>;
  workload: Record<string, number>;
  latestCiccImport: CiccImport | null;
};
type QueueRow = {
  credential_id: string; organization_id: string; firm_name: string; sample_mode?: boolean; licence_type: string; college_id: string; status: string;
  register_status: string | null; bucket: string; latest_result: string | null; checked_at: string | null; next_review_at: string | null;
  valid_until: string | null; verification_method: string | null; member_role: string | null;
};
type Queue = Page<QueueRow> & { kind: QueueKind; counts: Record<QueueKind, number> };
type NeedsReview = { credential_id: string; organization_id: string; firm_name: string; licence_type: string; college_id: string; credential_status: string; checked_at: string | null; reason: string | null };
type CiccImport = { id: string; imported_at: string; imported_by_email: string | null; source_note: string | null; row_count: number | null; status: string; completed_at: string | null; file_sha256: string | null; needs_review?: NeedsReview[] };

const KIND_LABEL: Record<QueueKind, string> = { adverse: "Adverse", needs_review: "Needs review", never_checked: "Never checked", overdue: "Overdue", due: "Due", all: "All" };
const LIMIT = 50;

export default function VerificationPage() {
  const [q, setQ] = useQueryState();
  const tab = q.get("tab") === "cicc" ? "cicc" : q.get("tab") === "firms" ? "firms" : "queue";
  const summary = useApi<Summary>("/verification/summary");
  const s = summary.data;
  const firms = s?.firmsByVerification ?? {};
  const lc = s?.licenceCounts ?? {};

  return (
    <>
      <PageHeader title="Verification" lede="Firm verification and licence checks against the CICC public register." />
      {s ? (
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <MetricCard icon={<Building2 className="ic" aria-hidden />} label="Firms pending review" value={num(firms.pending_review ?? 0)} sub={`${num(firms.verified ?? 0)} verified · ${num(firms.unverified ?? 0)} unverified · ${num(firms.restricted ?? 0)} restricted`} href="/verification?tab=firms" />
          <MetricCard icon={<AlarmClock className="ic" aria-hidden />} label="Licences due" value={num(lc.due ?? 0)} badge={<Badge tone={lc.due ? "warn" : "ok"}>within 7 days</Badge>} sub={`${num(lc.overdue ?? 0)} overdue · ${num(lc.never_checked ?? 0)} never checked`} href="/verification?kind=due" />
          <MetricCard icon={<AlertCircle className="ic" aria-hidden />} label="Needs review" value={num(lc.needs_review ?? 0)} href="/verification?kind=needs_review" />
          <MetricCard icon={<ShieldX className="ic" aria-hidden />} label="Adverse" value={num(lc.adverse ?? 0)} badge={<Badge tone={lc.adverse ? "bad" : "ok"}>{lc.adverse ? "act now" : "none"}</Badge>} href="/verification?kind=adverse" />
        </div>
      ) : summary.error ? <Alert tone="warn" title="Summary unavailable">The counts did not load. The lists below still work.</Alert> : <div style={{ marginBottom: 14 }}><SkeletonCards n={4} /></div>}
      <Tabs current={tab} items={[
        { key: "queue", label: "Licence queue", href: "/verification" },
        { key: "cicc", label: "CICC list", href: "/verification?tab=cicc" },
        { key: "firms", label: "Firms", href: "/verification?tab=firms" },
      ]} />
      {tab === "queue" ? <QueueTab kind={(QUEUE_KINDS as readonly string[]).includes(q.get("kind") ?? "") ? (q.get("kind") as QueueKind) : "due"} offset={Number(q.get("offset") ?? 0) || 0} setQ={setQ} />
        : tab === "cicc" ? <CiccTab latest={s?.latestCiccImport ?? null} upload={q.get("upload") === "1"} setQ={setQ} />
        : <FirmsTab />}
    </>
  );
}

function QueueTab({ kind, offset, setQ }: { kind: QueueKind; offset: number; setQ: (p: Record<string, string | null>) => void }) {
  const router = useRouter();
  const queue = useApi<Queue>(withQuery("/licences/queue", { kind, limit: LIMIT, offset }));
  const counts = queue.data?.counts;
  return (
    <>
      <div style={{ marginBottom: 12, overflowX: "auto" }}>
        <Seg label="Licence bucket" value={kind} onChange={(v) => setQ({ kind: v === "due" ? null : v, offset: null })}
          options={QUEUE_KINDS.map((k) => ({ value: k, label: <>{KIND_LABEL[k]}{counts ? <span className="muted"> {num(counts[k] ?? 0)}</span> : null}</> }))} />
      </div>
      <Panel title="Licence queue" icon={<BadgeCheck className="ic" aria-hidden />} right={queue.data ? `${num(queue.data.total)} ${queue.data.total === 1 ? "licence" : "licences"}` : null}>
        <Section loaded={queue} skeleton={<SkeletonRows n={5} />}>
          {(p) => (
            <>
              <DataTable
                caption="Licence queue"
                rows={p.items}
                rowKey={(r) => r.credential_id}
                onRowClick={(r) => router.push(`/verification/credentials/${r.credential_id}`)}
                empty={<Empty tone="ok" title={`Nothing in ${KIND_LABEL[kind].toLowerCase()}.`} />}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (r) => <><b><Link href={`/verification/credentials/${r.credential_id}`}>{r.firm_name}</Link></b> <SampleBadge on={r.sample_mode} /></> },
                  { key: "type", label: "Type", render: (r) => r.licence_type?.toUpperCase() ?? dash },
                  { key: "id", label: "College ID", render: (r) => <span className="mono">{r.college_id}</span> },
                  { key: "status", label: "Status", render: (r) => <Status value={r.status} /> },
                  { key: "reg", label: "Register status", render: (r) => (r.register_status ? words(r.register_status) : dash) },
                  { key: "bucket", label: "Bucket", render: (r) => <Badge tone={statusTone(r.bucket)}>{statusLabel(r.bucket)}</Badge> },
                  { key: "result", label: "Latest result", render: (r) => (r.latest_result ? <Status value={r.latest_result} /> : dash) },
                  { key: "checked", label: "Checked", render: (r) => day(r.checked_at) },
                  { key: "next", label: "Next review", render: (r) => (r.next_review_at ? day(r.next_review_at) : r.checked_at ? dash : "Now") },
                  { key: "valid", label: "Valid until", render: (r) => day(r.valid_until) },
                  { key: "method", label: "Method", render: (r) => methodLabel(r.verification_method) },
                  { key: "role", label: "Member role", render: (r) => (r.member_role ? words(r.member_role) : dash) },
                ]}
              />
              <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
    </>
  );
}

function CiccTab({ latest, upload, setQ }: { latest: CiccImport | null; upload: boolean; setQ: (p: Record<string, string | null>) => void }) {
  const imports = useApi<{ imports: CiccImport[] }>("/licences/cicc-imports?limit=20");
  return (
    <>
      <Panel title="CICC list" icon={<FileSpreadsheet className="ic" aria-hidden />} right={<CanOperate><button type="button" className="btn primary sm" onClick={() => setQ({ upload: "1" })}><Upload className="ic" aria-hidden /> Upload CSV</button></CanOperate>}>
        <div className="pad">
          {latest ? (
            <dl className="dl">
              <div><dt>Current list</dt><dd>Imported {when(latest.imported_at)}{latest.imported_by_email ? ` by ${latest.imported_by_email}` : ""}</dd></div>
              <div><dt>Rows</dt><dd>{latest.row_count !== null ? `${num(latest.row_count)} licensees` : dash}</dd></div>
              <div><dt>Source</dt><dd>{latest.source_note ?? dash}</dd></div>
              <div><dt>Status</dt><dd><Status value={latest.status} />{latest.needs_review?.length ? <> · {num(latest.needs_review.length)} {latest.needs_review.length === 1 ? "needs" : "need"} review</> : null}</dd></div>
            </dl>
          ) : <p style={{ margin: 0 }}>No CICC list imported yet. Licences can still be checked one by one against the register.</p>}
          <p className="foot">Two steps: a dry run shows what the file contains; nothing is saved until you choose Import.</p>
        </div>
      </Panel>
      <Panel title="Imports" icon={<FileSpreadsheet className="ic" aria-hidden />}>
        <Section loaded={imports} skeleton={<SkeletonRows n={3} />}>
          {(d) => (d.imports.length ? (
            <ul className="gl">
              {d.imports.map((i) => (
                <li key={i.id} style={{ display: "block" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{when(i.imported_at)}</b><Status value={i.status} />
                    <span className="muted">{[i.imported_by_email, i.row_count !== null ? `${num(i.row_count)} rows` : null, i.completed_at ? `completed ${when(i.completed_at)}` : null, i.file_sha256 ? `SHA-256 ${i.file_sha256.slice(0, 12)}` : null].filter(Boolean).join(" · ")}</span>
                  </div>
                  {i.source_note ? <small>{i.source_note}</small> : null}
                  {i.needs_review?.length ? (
                    <div className="tw" style={{ marginTop: 8 }}>
                      <table className="dt">
                        <caption className="sr-only">Credentials that need review after import {short(i.id)}</caption>
                        <thead><tr><th scope="col">Firm</th><th scope="col">Licence</th><th scope="col">Status</th><th scope="col">Checked</th><th scope="col">Reason</th></tr></thead>
                        <tbody>
                          {i.needs_review.map((n) => (
                            <tr key={n.credential_id}>
                              <td className="first" data-l=""><Link href={`/verification/credentials/${n.credential_id}`}>{n.firm_name}</Link></td>
                              <td data-l="Licence">{n.licence_type?.toUpperCase()} <span className="mono">{n.college_id}</span></td>
                              <td data-l="Status"><Status value={n.credential_status} /></td>
                              <td data-l="Checked">{day(n.checked_at)}</td>
                              <td data-l="Reason">{n.reason ?? dash}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <Empty title="No CICC list imported yet.">Licences can still be checked one by one against the register.</Empty>)}
        </Section>
      </Panel>
      {upload ? <CanOperate><CiccUploadDrawer onClose={() => setQ({ upload: null })} /></CanOperate> : null}
    </>
  );
}

function FirmsTab() {
  return <FirmsTable embedded />;
}
