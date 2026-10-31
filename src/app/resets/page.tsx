"use client";
import { useState } from "react";
import { ShieldCheck } from "@/components/icons";
import { ApiFailure, api, withQuery } from "@/client/api";
import { CanOperate, useAdmin } from "@/client/app";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { short, when } from "@/client/format";
import { stepUpNeed } from "@/client/session-rules";
import { Alert, CodeInput, DataTable, Drawer, Empty, ErrorAlert, PageHeader, Panel, Section, SkeletonRows, Status, Tabs, TextArea } from "@/components/ui";

/**
 * Two-step resets (app migration 20261102100100): a firm's only owner lost their two-step device.
 * Casevoya confirms it's really them, then approves (their two-step methods are removed and their
 * sessions end; they sign in with their password and set it up again) or denies. Requests expire
 * after 24 hours; the database refuses expired ones and an admin's own request. Every decision is audited.
 */
export type ResetRow = {
  id: string;
  organization_id: string;
  firm_name: string | null;
  requester_user_id: string;
  requester_name: string | null;
  requester_email: string | null;
  requester_role: string;
  reason: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  factors_cleared_at: string | null;
};
type ResetPage = { items: ResetRow[]; counts: { pending: number; closed: number } };

const LIMIT = 50;

export default function ResetsPage() {
  const [q] = useQueryState();
  const state = q.get("state") === "closed" ? "closed" : "pending";
  const list = useApi<ResetPage>(withQuery("/resets", { state, limit: LIMIT, offset: 0 }), { poll: () => 60_000 });
  const [open, setOpen] = useState<ResetRow | null>(null);
  const c = list.data?.counts;
  return (
    <>
      <PageHeader
        title="Two-step resets"
        lede="When a firm's only owner loses their two-step device, the request comes here. Confirm it's really them on a video call before you approve. Requests expire after 24 hours."
      />
      <Tabs current={state} items={[
        { key: "pending", label: c ? `Pending (${c.pending})` : "Pending", href: "/resets" },
        { key: "closed", label: c ? `Closed (${c.closed})` : "Closed", href: "/resets?state=closed" },
      ]} />
      <Panel title="Reset requests" icon={<ShieldCheck className="ic" aria-hidden />}>
        <Section loaded={list} skeleton={<SkeletonRows n={3} />}>
          {(page) => (
            <DataTable
              caption="Two-step reset requests"
              rows={page.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => (r.status === "pending" ? setOpen(r) : undefined)}
              empty={<Empty title={state === "pending" ? "No reset requests waiting." : "No closed reset requests."}>Only owners with no other owner in their firm come here; other requests go to the firm&apos;s owners.</Empty>}
              columns={[
                { key: "firm", label: "Firm", first: true, render: (r) => <b>{r.firm_name ?? short(r.organization_id)}</b> },
                { key: "who", label: "Person", render: (r) => <>{r.requester_name ?? "—"}<br /><span className="mono">{r.requester_email ?? short(r.requester_user_id)}</span></> },
                { key: "what", label: "What happened", render: (r) => r.reason ?? "—" },
                { key: "status", label: "Status", render: (r) => <Status value={r.status} /> },
                { key: "asked", label: "Asked", render: (r) => when(r.created_at) },
                { key: "exp", label: state === "pending" ? "Expires" : "Decided", render: (r) => (r.status === "pending" ? when(r.expires_at) : when(r.decided_at)) },
                { key: "act", label: "", render: (r) => (r.status === "pending" ? <CanOperate><button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Review</button></CanOperate> : null) },
              ]}
            />
          )}
        </Section>
      </Panel>
      {open ? <Decide row={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Decide({ row, onClose }: { row: ResetRow; onClose: () => void }) {
  const { me, now, withAuth, toast, online } = useAdmin();
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inlineCode = stepUpNeed(me.session, now) === "code";
  const codeOk = !inlineCode || code.length === 6;

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await withAuth((retry) => api.post(`/resets/${row.id}/decide`, { approve, note: note.trim() || null, confirmIdentity: approve ? confirmed : undefined, code: inlineCode && !retry && code ? code : undefined }));
      refreshAll();
      toast(approve ? "Approved. Their two-step methods were removed and they were emailed." : "Denied. They were emailed that nothing changed.");
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Drawer open title="Two-step reset" onClose={onClose} dirty={Boolean(note) || confirmed} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={busy || !online || !codeOk} onClick={() => void decide(false)}>Deny</button>
        <button type="button" className="btn primary" disabled={busy || !online || !confirmed || !codeOk} onClick={() => void decide(true)}>{busy ? "Saving…" : "Approve reset"}</button>
      </>
    }>
      <div className="form">
        <dl className="dl">
          <div><dt>Firm</dt><dd>{row.firm_name ?? row.organization_id}</dd></div>
          <div><dt>Person</dt><dd>{row.requester_name ?? "—"} · <span className="mono">{row.requester_email ?? row.requester_user_id}</span> · {row.requester_role.replace(/_/g, " ")}</dd></div>
          <div><dt>What happened</dt><dd>{row.reason ?? "—"}</dd></div>
          <div><dt>Asked</dt><dd>{when(row.created_at)}</dd></div>
          <div><dt>Expires</dt><dd>{when(row.expires_at)}</dd></div>
        </dl>
        <Alert tone="info" title="Approving removes their two-step methods">Their sessions end and their recovery codes stop working. They sign in with their password and set up two-step again. They are emailed the outcome.</Alert>
        <label className="chk"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirmed it&apos;s really them on a video call or in person</label>
        <TextArea id="r-note" label="Note (optional)" hint="Up to 500 characters. Kept with the request." max={500} value={note} onChange={setNote} />
        {inlineCode ? <div className="codebox-wrap"><p>Your last authenticator check is older than 15 minutes.</p><CodeInput id="r-code" value={code} onChange={setCode} /></div> : null}
        {error ? (error instanceof ApiFailure && ["conflict", "not_found", "forbidden", "validation_failed"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
      </div>
    </Drawer>
  );
}
