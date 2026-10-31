"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FlaskConical, LayoutGrid, TriangleAlert } from "@/components/icons";
import { withQuery } from "@/client/api";
import { useApi, useQueryState } from "@/client/hooks";
import { num, words } from "@/client/format";
import { Badge, DataTable, Empty, MetricCard, PageHeader, Pager, Panel, Section, SkeletonCards, SkeletonRows } from "@/components/ui";

type Row = { organization_id: string; display_name: string; slug: string; sample_mode: boolean; sample_matters: number; real_matters: number; sample_privacy_requests: number; sample_migration_batches: number; sample_ai_runs: number; proof_steps_done: string[]; proof_complete: boolean; mixed: boolean };
type Sample = { items: Row[]; total: number; summary: { firms_in_sample_mode: number; firms_total: number; proof_complete: number; mixed: number }; proof_steps: string[]; limit: number; offset: number };
const LIMIT = 100;

export default function SampleModePage() {
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const offset = Number(q.get("offset") ?? 0) || 0;
  const sample = useApi<Sample>(withQuery("/sample-mode", { limit: LIMIT, offset }));
  const s = sample.data?.summary;

  return (
    <>
      <PageHeader title="Sample mode" lede="Firms trying Casevoya with sample data, and how far through the proof steps they are. No actions." />
      {s ? (
        <div className="grid g3" style={{ marginBottom: 12 }}>
          <MetricCard icon={<FlaskConical className="ic" aria-hidden />} label="Firms in sample mode" value={num(s.firms_in_sample_mode)} sub={`${num(s.firms_total)} listed with sample data`} />
          <MetricCard icon={<CheckCircle2 className="ic" aria-hidden />} label="Proof complete" value={num(s.proof_complete)} />
          <MetricCard icon={<TriangleAlert className="ic" aria-hidden />} label="Mixed (sample + real matters)" value={num(s.mixed)} className={s.mixed ? "warn" : undefined} />
        </div>
      ) : sample.error ? null : <div style={{ marginBottom: 12 }}><SkeletonCards n={3} /></div>}
      <Panel title="Firms" icon={<LayoutGrid className="ic" aria-hidden />}>
        <Section loaded={sample} skeleton={<SkeletonRows n={4} />}>
          {(p) => (
            <>
              <DataTable caption="Firms with sample data" rows={p.items} rowKey={(r) => r.organization_id} onRowClick={(r) => router.push(`/firms/${r.organization_id}`)}
                empty={<Empty title="No firm is using sample data." />}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (r) => <><b><Link href={`/firms/${r.organization_id}`}>{r.display_name}</Link></b>{r.mixed ? <> <Badge tone="warn">Mixed</Badge></> : null}<small>{r.slug}</small></> },
                  { key: "mode", label: "Sample mode", render: (r) => <Badge tone={r.sample_mode ? "info" : "neutral"}>{r.sample_mode ? "On" : "Off"}</Badge> },
                  { key: "sm", label: "Sample matters", render: (r) => num(r.sample_matters) },
                  { key: "rm", label: "Real matters", render: (r) => num(r.real_matters) },
                  { key: "spr", label: "Privacy", mobileLabel: "Sample privacy requests", render: (r) => num(r.sample_privacy_requests) },
                  { key: "smb", label: "Imports", mobileLabel: "Sample import batches", render: (r) => num(r.sample_migration_batches) },
                  { key: "sai", label: "AI runs", mobileLabel: "Sample AI runs", render: (r) => num(r.sample_ai_runs) },
                  { key: "proof", label: "Proof steps", render: (r) => (
                    <span title={p.proof_steps.map((st) => `${words(st)}: ${r.proof_steps_done.includes(st) ? "done" : "not yet"}`).join(", ")}>
                      <span className="proof" role="img" aria-label={`${r.proof_steps_done.length} of ${p.proof_steps.length} proof steps done`}>
                        {p.proof_steps.map((st) => <i key={st} className={r.proof_steps_done.includes(st) ? "on" : undefined} />)}
                      </span>
                      <small>{p.proof_steps.join(" · ")}</small>
                    </span>
                  ) },
                  { key: "done", label: "Done", render: (r) => (r.proof_complete ? <Badge tone="ok">Complete</Badge> : `${r.proof_steps_done.length} of ${p.proof_steps.length}`) },
                ]} />
              <Pager total={p.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
      <p className="foot">Sample counts are per firm: matters, privacy requests, import batches and AI runs. Firm owners turn sample mode on or off and clear sample data in Casevoya; there are no actions here.</p>
    </>
  );
}
