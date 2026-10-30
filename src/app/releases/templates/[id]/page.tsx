"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, FileDiff, FlaskConical, Link2, NotebookPen, Users } from "lucide-react";
import { api } from "@/client/api";
import { useAdmin } from "@/client/app";
import { ConfirmDialog } from "@/client/confirm";
import { useApi } from "@/client/hooks";
import { day, when, words } from "@/client/format";
import { DraftForm, type Body, type VersionDetail } from "@/client/releases";
import { Alert, Badge, Empty, PageHeader, Panel, Section, Skeleton, SkeletonRows, Status, Timeline } from "@/components/ui";

type Decision = "approve" | "reject" | "rollback";

/** Items diff with text labels (spec 2.7 JsonDiff). */
function Side({ label, body, other, mark }: { label: string; body: Body | null; other: Body | null; mark: "rem" | "add" }) {
  if (!body) return <div><h4>{label}</h4><p className="muted" style={{ margin: 0 }}>Nothing published before.</p></div>;
  const otherItems = new Set(other?.items ?? []);
  const changed = (a: unknown, b: unknown) => other !== null && a !== b;
  return (
    <div>
      <h4>{label}</h4>
      <p style={{ margin: "0 0 4px" }}><b className={changed(body.title, other?.title) ? mark : undefined}>{body.title}</b>{changed(body.title, other?.title) ? <span className="sr-only"> ({mark === "add" ? "changed" : "before"})</span> : null}</p>
      {body.summary ? <p style={{ margin: "0 0 6px" }} className={changed(body.summary, other?.summary) ? mark : undefined}>{body.summary}</p> : null}
      <ul>
        {body.items.map((item, i) => {
          const diff = other !== null && !otherItems.has(item);
          return <li key={`${i}-${item}`}>{diff ? <span className={mark}><span className="sr-only">{mark === "add" ? "Added: " : "Removed: "}</span>{item}</span> : item}{diff ? <Badge tone={mark === "add" ? "ok" : "bad"}>{mark === "add" ? "Added" : "Removed"}</Badge> : null}</li>;
        })}
      </ul>
    </div>
  );
}

export default function VersionPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const sourcesFailed = search.get("sourcesFailed");
  const { me } = useAdmin();
  const detail = useApi<VersionDetail>(`/templates/versions/${id}`);
  const [action, setAction] = useState<Decision | null>(null);
  const [revise, setRevise] = useState(false);
  const [compared, setCompared] = useState(false);
  const d = detail.data;
  const v = d?.version;
  const prev = d?.diff.before ? `v${(v?.version_number ?? 1) - 1}` : null;
  const reviewer = me.capabilities.reviewTemplates;
  const canDecide = Boolean(v && reviewer && v.status === "draft" && !d?.hints.isAuthor);
  const canRollback = Boolean(v && reviewer && v.status === "published");
  const canRevise = Boolean(v && d?.hints.isAuthor && v.status === "draft" && me.capabilities.operate);

  return (
    <>
      <PageHeader
        crumb={<><Link href="/releases?tab=templates">Releases</Link> › {v ? `v${v.version_number}` : "…"}</>}
        title={v ? <>{v.body.title} · v{v.version_number}</> : <Skeleton h={34} w={360} />}
        lede={v ? <><span className="mono">{v.stable_key}</span> · {v.status === "draft" ? "Draft" : words(v.status)}{v.author_name ? ` by ${v.author_name}` : ""} · effective {day(v.effective_on)} <Status value={v.status === "draft" ? "awaiting_review" : v.status} label={v.status === "draft" ? "Awaiting review" : undefined} /></> : null}
        actions={v ? (
          <>
            {canRevise ? <button type="button" className="btn" onClick={() => setRevise(true)}>Revise</button> : null}
            {canDecide ? <button type="button" className="btn" onClick={() => setAction("reject")}>Reject</button> : null}
            {canRollback ? <button type="button" className="btn danger" onClick={() => setAction("rollback")}>Roll back</button> : null}
            {canDecide ? <button type="button" className="btn primary" disabled={!d?.hints.hasOfficialSource} title={d?.hints.hasOfficialSource ? undefined : "Add at least one official source"} onClick={() => setAction("approve")}><CheckCircle2 className="ic" aria-hidden />Approve and publish</button> : null}
          </>
        ) : null}
      />
      {sourcesFailed !== null ? <Alert tone="warn" title="The draft was saved, but its sources were not.">{sourcesFailed || "Revise the draft to add them again."}</Alert> : null}
      {d && v?.status === "draft" && !d.hints.hasOfficialSource ? <Alert tone="warn" title="This draft has no official source.">Publishing needs at least one source on the official-domain list.{canDecide ? " Approve stays disabled until the author adds one." : ""}</Alert> : null}
      {d && v?.status === "draft" && d.hints.isAuthor && reviewer ? <Alert tone="info" title="You wrote this draft.">Another reviewer has to approve it.</Alert> : null}
      <Section loaded={detail} skeleton={<SkeletonRows n={8} />} notFound={<Empty title="This version does not exist."><Link href="/releases?tab=templates">Back to templates</Link></Empty>}>
        {({ version, sources, reviews, diff }) => (
          <>
            <Panel title={diff.before ? `Changes from ${prev}` : "First version"} icon={<FileDiff className="ic" aria-hidden />}>
              <div className="pad">
                <div className="diff">
                  <Side label={diff.before ? `Published ${prev}` : "Before"} body={diff.before} other={diff.after} mark="rem" />
                  <Side label={`${version.status === "draft" ? "Draft" : words(version.status)} v${version.version_number}`} body={diff.after} other={diff.before} mark="add" />
                </div>
                {diff.before && !diff.changes.length ? <p className="muted" style={{ margin: "8px 0 0" }}>No changes to title, summary or items.</p> : null}
              </div>
            </Panel>
            <div className="cols even">
              <Panel title="Sources" icon={<Link2 className="ic" aria-hidden />}>
                {sources.length ? (
                  <ul className="gl">
                    {sources.map((s) => (
                      <li key={s.position}>
                        <span className="ki"><Link2 className="ic" aria-hidden /></span>
                        <div><a href={s.url} target="_blank" rel="noreferrer noopener"><b>{s.host}</b>{s.title ? ` · ${s.title}` : ""}</a><small>{s.retrieved_on ? `Retrieved ${day(s.retrieved_on)}` : "No retrieval date"}{s.note ? ` · ${s.note}` : ""}</small></div>
                        <span className="bd">{s.official ? <Badge tone="ok">Official</Badge> : <Badge tone="warn">Not official</Badge>}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="pad muted" style={{ margin: 0 }}>No sources.</p>}
              </Panel>
              <Panel title="Test evidence" icon={<FlaskConical className="ic" aria-hidden />}><p className="pad" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{version.test_evidence ?? "—"}</p></Panel>
            </div>
            <div className="cols even">
              <Panel title="Changelog" icon={<NotebookPen className="ic" aria-hidden />}><p className="pad" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{version.changelog ?? "—"}</p></Panel>
              <Panel title="Reviews" icon={<Users className="ic" aria-hidden />}>
                <div className="pad">
                  {reviews.length ? (
                    <Timeline items={reviews.map((r, i) => ({ key: String(i), at: r.decided_at, title: <>{words(r.decision)}{r.reviewer_label ? ` · ${r.reviewer_label}` : ""}</>, meta: r.reason ?? undefined }))} />
                  ) : <p className="muted" style={{ margin: 0 }}>No reviews yet. The author can&apos;t approve their own draft. Approve is disabled when a version has no official source.</p>}
                  {version.published_at ? <p className="muted" style={{ fontSize: 12.5 }}>Published {when(version.published_at)}.</p> : null}
                </div>
              </Panel>
            </div>
            <History stableKey={version.stable_key} current={version.id} />
          </>
        )}
      </Section>

      {revise && d ? <DraftForm revise={d} onClose={() => setRevise(false)} /> : null}
      {action === "approve" && v ? (
        <ConfirmDialog title={`Approve and publish v${v.version_number}?`} confirmLabel="Approve and publish" stepUp disabled={!compared} successToast="Published to adopting firms"
          extra={<label className="check"><input type="checkbox" checked={compared} onChange={(e) => setCompared(e.target.checked)} />I compared this draft with the published version and its sources</label>}
          onConfirm={({ code }) => api.post(`/templates/versions/${v.id}/approve`, { confirmCompared: true, ...(code ? { code } : {}) })}
          onClose={() => { setAction(null); setCompared(false); }}>
          <p style={{ margin: 0 }}>{prev ? `Publishing replaces ${prev} for every adopting firm; they are notified in Casevoya.` : "This becomes the first published version. Firms that adopt it are notified in Casevoya."}</p>
        </ConfirmDialog>
      ) : null}
      {action === "reject" && v ? (
        <ConfirmDialog title={`Reject v${v.version_number}?`} confirmLabel="Reject" danger stepUp reason={{ min: 3, max: 500 }} successToast="Draft rejected"
          onConfirm={({ reason, code }) => api.post(`/templates/versions/${v.id}/reject`, { reason, ...(code ? { code } : {}) })} onClose={() => setAction(null)}>
          <p style={{ margin: 0 }}>The draft closes. The author has to write a new draft.</p>
        </ConfirmDialog>
      ) : null}
      {action === "rollback" && v ? (
        <ConfirmDialog title={v.supersedes_version_id ? `Withdraw v${v.version_number} and restore v${v.version_number - 1}?` : `Withdraw v${v.version_number}?`} confirmLabel="Roll back" danger stepUp reason={{ min: 3, max: 500 }} successToast="Rolled back"
          onConfirm={({ reason, code }) => api.post(`/templates/versions/${v.id}/rollback`, { reason, ...(code ? { code } : {}) })} onClose={() => setAction(null)}>
          {v.supersedes_version_id
            ? <p style={{ margin: 0 }}>Adopting firms get the previous version back and are notified in Casevoya.</p>
            : <Alert tone="warn" title="There is no earlier version: the template will have no published version." />}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

type HistoryData = { stable_key: string; versions: { id: string; version_number: number; status: string; author_name: string | null; reviewer_label: string | null; reviewed_at: string | null; published_at: string | null; effective_on: string | null; changelog: string | null }[] };

function History({ stableKey, current }: { stableKey: string; current: string }) {
  const history = useApi<HistoryData>(`/templates/history/${encodeURIComponent(stableKey)}`);
  return (
    <Panel title="History" icon={<FileDiff className="ic" aria-hidden />}>
      <Section loaded={history} skeleton={<SkeletonRows n={2} />}>
        {(h) => (
          <ul className="gl">
            {h.versions.map((x) => (
              <li key={x.id}>
                <div>{x.id === current ? <b>v{x.version_number} (this version)</b> : <Link href={`/releases/templates/${x.id}`}><b>v{x.version_number}</b></Link>}<small>{[x.author_name && `by ${x.author_name}`, x.reviewer_label && `reviewed by ${x.reviewer_label}`, x.published_at && `published ${when(x.published_at)}`].filter(Boolean).join(" · ") || "—"}</small></div>
                <span className="bd"><Status value={x.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  );
}
