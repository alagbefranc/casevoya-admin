"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, ClipboardCheck, History, ListChecks, RefreshCw } from "lucide-react";
import { api } from "@/client/api";
import { CanOperate, useAdmin } from "@/client/app";
import { refreshAll, useApi } from "@/client/hooks";
import { dash, day, when, words } from "@/client/format";
import { CheckRow, ManualCheckDrawer, type CredentialDetail } from "@/client/licences";
import { isRegisterUrl } from "@/client/licence-rules";
import { Alert, Badge, ErrorAlert, PageHeader, Panel, Section, Skeleton, SkeletonRows, Status, Timeline } from "@/components/ui";

function hostOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

/** Only the public CICC register is linked; any other recorded source is shown as plain text. */
function SourceLink({ url }: { url: string }) {
  if (!isRegisterUrl(url)) return <span className="mono" style={{ wordBreak: "break-all" }}>{url}</span>;
  return <a href={url.trim()} target="_blank" rel="noreferrer noopener">{hostOf(url.trim())}</a>;
}

const yn = (v: boolean | null | undefined) => (v === null || v === undefined ? dash : v ? "Yes" : "No");

export default function CredentialPage() {
  const { id } = useParams<{ id: string }>();
  const { withAuth, toast, online } = useAdmin();
  const detail = useApi<CredentialDetail>(`/licences/credentials/${id}`);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const c = detail.data?.credential;

  const ciccCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await withAuth(() => api.post<{ checkId: string; credential: CredentialDetail }>(`/licences/credentials/${id}/cicc-check`, {}));
      refreshAll();
      toast(`Checked against the CICC list: ${words(out.credential?.checks?.[0]?.result ?? out.credential?.credential.status ?? "done")}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const flags = c ? [c.discipline_suspended && "Suspended", c.discipline_revoked && "Revoked", c.discipline_restricted && "Restricted"].filter(Boolean) : [];
  return (
    <>
      <PageHeader
        crumb={<><Link href="/verification">Verification</Link> › {c?.college_id ?? "Credential"}</>}
        title={c ? <>{c.licence_type.toUpperCase()} · {c.college_id}</> : <Skeleton h={34} w={300} />}
        badge={c ? <Status value={c.status} /> : null}
        lede={c ? <>{c.firm_name}{c.member_role ? ` · ${words(c.member_role)}` : ""}</> : null}
        actions={c ? (
          <CanOperate>
            <button type="button" className="btn" disabled={busy || !online} onClick={() => void ciccCheck()}><RefreshCw className="ic" aria-hidden /> {busy ? "Checking…" : "Check against CICC list"}</button>
            <button type="button" className="btn primary" disabled={!online} onClick={() => setChecking(true)}><ClipboardCheck className="ic" aria-hidden /> Record manual check</button>
          </CanOperate>
        ) : null}
      />
      {error ? <div style={{ marginBottom: 12 }}><ErrorAlert error={error} /></div> : null}
      <Section loaded={detail} skeleton={<SkeletonRows n={6} />} notFound="This credential does not exist or was removed.">
        {(d) => (
          <div className="cols even">
            <div>
              <Panel title="Credential" icon={<BadgeCheck className="ic" aria-hidden />}>
                <div className="pad">
                  <dl className="dl">
                    <div><dt>Firm</dt><dd><Link href={`/firms/${d.credential.organization_id}`}>{d.credential.firm_name}</Link></dd></div>
                    <div><dt>Type</dt><dd>{d.credential.licence_type.toUpperCase()}</dd></div>
                    <div><dt>College ID</dt><dd className="mono">{d.credential.college_id}</dd></div>
                    <div><dt>Status</dt><dd><Status value={d.credential.status} /></dd></div>
                    <div><dt>Register status</dt><dd>{d.credential.register_status ? words(d.credential.register_status) : dash}</dd></div>
                    <div><dt>Entitled to practise</dt><dd>{yn(d.credential.entitlement_to_practise)}</dd></div>
                    <div><dt>Discipline</dt><dd>{flags.length ? <span className="badges">{flags.map((f) => <Badge key={String(f)} tone="bad">{f}</Badge>)}</span> : "None recorded"}</dd></div>
                    <div><dt>Method</dt><dd>{d.credential.verification_method ? words(d.credential.verification_method) : dash}</dd></div>
                    {d.credential.discipline_restriction_detail ? <div style={{ gridColumn: "1 / -1" }}><dt>Restriction</dt><dd>{d.credential.discipline_restriction_detail}</dd></div> : null}
                    <div><dt>Source</dt><dd>{d.credential.source_url ? <SourceLink url={d.credential.source_url} /> : dash}</dd></div>
                    <div><dt>Declared</dt><dd>{day(d.credential.declared_at)}</dd></div>
                    <div><dt>Checked</dt><dd>{when(d.credential.checked_at)}</dd></div>
                    <div><dt>Next review</dt><dd>{d.credential.next_review_at ? day(d.credential.next_review_at) : "Now"}</dd></div>
                    <div><dt>Valid until</dt><dd>{day(d.credential.valid_until)}</dd></div>
                  </dl>
                </div>
              </Panel>
              {d.change_reports.length ? (
                <Panel title="Change reports" icon={<History className="ic" aria-hidden />}>
                  <ul className="gl">{d.change_reports.map((r) => <li key={r.id}><span>{when(r.created_at)}</span><small className="muted">{Object.keys(r).filter((k) => !["id", "created_at"].includes(k)).map((k) => words(k)).join(", ")}</small></li>)}</ul>
                </Panel>
              ) : null}
            </div>
            <Panel title="Checks" icon={<ListChecks className="ic" aria-hidden />}>
              {d.checks.length ? (
                <div className="pad">
                  <Timeline items={d.checks.map((ch) => ({
                    key: ch.id, at: ch.retrieved_at ?? ch.created_at,
                    title: <CheckRow c={ch} />,
                    meta: ch.cicc_import_id ? <Link href="/verification?tab=cicc">CICC import</Link> : null,
                  }))} />
                </div>
              ) : <div className="pad"><Alert tone="info">Never checked. Record a manual check or check it against the CICC list.</Alert></div>}
            </Panel>
          </div>
        )}
      </Section>
      {checking && c ? <ManualCheckDrawer credential={c} onClose={() => setChecking(false)} /> : null}
    </>
  );
}
