"use client";
import { useRef, useState } from "react";
import { Inbox } from "@/components/icons";
import { ApiFailure, api, withQuery } from "@/client/api";
import { CanOperate, useAdmin } from "@/client/app";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { short, when } from "@/client/format";
import {
  canSend, claimSend, finishSend, keptFirm, releaseSend, sendBody,
  type ConnectRequest, type IntroductionFirm, type ReferralList, type SendResult,
} from "@/client/referrals";
import { stepUpNeed } from "@/client/session-rules";
import { Alert, CodeInput, DataTable, Drawer, Empty, ErrorAlert, PageHeader, Pager, Panel, Section, SelectField, SkeletonRows, Status, Tabs } from "@/components/ui";

/**
 * Introduction requests from Find. A request stays New until an owner or operator chooses one
 * currently eligible firm and confirms. Send creates one lead in that firm and does not email anyone.
 */
const LIMIT = 50;

export default function ReferralsPage() {
  const [q, setQ] = useQueryState();
  const state = q.get("state") === "sent" ? "sent" : "new";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const list = useApi<ReferralList>(withQuery("/referrals", { state, limit: LIMIT, offset }), { poll: () => 60_000 });
  const [open, setOpen] = useState<ConnectRequest | null>(null);
  const counts = list.data?.counts;
  const total = state === "sent" ? counts?.sent ?? 0 : counts?.new ?? 0;
  return (
    <>
      <PageHeader
        title="Referrals"
        lede="Someone asked for an introduction on Find. Nothing is sent until you choose one firm and confirm. That creates one lead in that firm and does not email or text anyone."
      />
      <Tabs current={state} items={[
        { key: "new", label: counts ? `New (${counts.new})` : "New", href: "/referrals" },
        { key: "sent", label: counts ? `Sent (${counts.sent})` : "Sent", href: "/referrals?state=sent" },
      ]} />
      <Panel title="Introduction requests" icon={<Inbox className="ic" aria-hidden />}>
        <Section loaded={list} skeleton={<SkeletonRows n={4} />}>
          {(page) => (
            <>
              <DataTable
                caption="Introduction requests"
                rows={page.items}
                rowKey={(row) => row.id}
                onRowClick={(row) => setOpen(row)}
                empty={<Empty title={state === "new" ? "No new introduction requests." : "No introductions have been sent."}>{state === "new" ? "A request appears here after someone submits the Find form. It stays New until you send it." : "Sent requests are the ones a person already sent to one firm."}</Empty>}
                columns={[
                  { key: "name", label: "Name", first: true, render: (row) => <b>{row.name}</b> },
                  { key: "email", label: "Email", render: (row) => <span className="mono">{row.email}</span> },
                  { key: "goal", label: "Goal", render: (row) => row.goal },
                  { key: "country", label: "Country", render: (row) => row.country },
                  { key: "language", label: "Language", render: (row) => row.language },
                  { key: "when", label: "Submitted", render: (row) => when(row.submitted_at) },
                  { key: "status", label: "Status", render: (row) => <Status value={row.status} /> },
                  { key: "act", label: "", className: "act", render: (row) => <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setOpen(row); }}>{row.status === "New" ? "Review" : "View"}</button> },
                ]}
              />
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={(next) => setQ({ offset: next ? String(next) : null })} />
            </>
          )}
        </Section>
      </Panel>
      {open ? <Review row={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Review({ row, onClose }: { row: ConnectRequest; onClose: () => void }) {
  const { me, now, withAuth, toast, online } = useAdmin();
  const firms = useApi<{ items: IntroductionFirm[] }>(me.capabilities.operate && row.status === "New" ? "/referrals/firms" : null);
  const [picked, setPicked] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const inlineCode = stepUpNeed(me.session, now) === "code";
  const codeOk = !inlineCode || code.length === 6;
  const firmItems = firms.data?.items ?? null;
  const organizationId = firmItems ? keptFirm(picked, firmItems) : "";

  const ready = canSend({
    role: me.role,
    organizationId,
    confirmSend: confirmed,
    busy,
    online,
    codeOk,
    firms: firmItems,
  });

  const send = async () => {
    // The ref locks the first click; a second click in the same turn does not start another request.
    if (!claimSend(lock)) return;
    if (!canSend({ role: me.role, organizationId, confirmSend: confirmed, busy: false, online, codeOk, firms: firmItems })) {
      releaseSend(lock);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await withAuth((retry) => api.post<SendResult>(`/referrals/${row.id}/send`, sendBody(organizationId, inlineCode && !retry && code ? code : undefined)));
      const done = finishSend(row, { ok: true, result });
      if (!done.close) {
        setError(new ApiFailure("upstream_error", "The send did not return a lead. Nothing was marked sent.", 502, null));
        return;
      }
      refreshAll();
      if (done.toast) toast(done.toast);
      onClose();
    } catch (caught) {
      const done = finishSend(row, { ok: false });
      if (done.close) onClose();
      if (caught instanceof ApiFailure && (caught.code === "conflict" || caught.code === "not_found")) refreshAll();
      setError(caught);
    } finally {
      releaseSend(lock);
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Drawer open title={row.status === "New" ? "Review introduction" : "Sent introduction"} onClose={onClose} dirty={confirmed || Boolean(organizationId)} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        {row.status === "New" ? (
          <CanOperate>
            <button type="button" className="btn primary" disabled={!ready} onClick={() => void send()}>{busy ? "Sending…" : "Send"}</button>
          </CanOperate>
        ) : null}
      </>
    }>
      <div className="form">
        <dl className="dl">
          <div><dt>Name</dt><dd>{row.name}</dd></div>
          <div><dt>Email</dt><dd className="mono">{row.email}</dd></div>
          <div><dt>Goal</dt><dd>{row.goal}</dd></div>
          <div><dt>Country</dt><dd>{row.country}{row.zone ? ` · ${row.zone}` : ""}{row.code ? ` (${row.code})` : ""}</dd></div>
          <div><dt>Language</dt><dd>{row.language}</dd></div>
          <div><dt>Submitted</dt><dd>{when(row.submitted_at)}</dd></div>
          <div><dt>Status</dt><dd><Status value={row.status} /></dd></div>
          {row.status === "Sent" ? (
            <>
              <div><dt>Firm</dt><dd>{row.firm_name ?? short(row.organization_id)}</dd></div>
              <div><dt>Lead</dt><dd className="mono">{row.lead_id ?? "—"}</dd></div>
              <div><dt>Sent</dt><dd>{when(row.sent_at)}</dd></div>
            </>
          ) : null}
        </dl>
        {row.status === "New" ? (
          <CanOperate fallback={<Alert tone="info" title="Viewers can read this request. An owner or operator sends it." />}>
            <Alert tone="info" title="One firm, one lead">Choose the firm yourself. Send does not pick one for you, and it does not email or text anyone.</Alert>
            <FirmChoice firms={firms} organizationId={organizationId} onOrganizationId={setPicked} />
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Send this one request to the firm chosen above. This creates one lead and does not email or text anyone.
            </label>
            {inlineCode ? <CodeInput id="referral-code" value={code} onChange={setCode} /> : null}
          </CanOperate>
        ) : null}
        {error ? <ErrorAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function FirmChoice({ firms, organizationId, onOrganizationId }: {
  firms: { data: { items: IntroductionFirm[] } | null; error: unknown; loading: boolean; reload: () => Promise<void> };
  organizationId: string;
  onOrganizationId: (id: string) => void;
}) {
  if (firms.loading && !firms.data) return <SkeletonRows n={2} />;
  if (firms.error && !firms.data) return <ErrorAlert error={firms.error} onRetry={() => void firms.reload()} />;
  const items = firms.data?.items ?? [];
  return (
    <>
      {firms.error ? <ErrorAlert error={firms.error} onRetry={() => void firms.reload()} /> : null}
      {items.length ? (
        <SelectField
          id="referral-firm"
          label="Firm"
          value={organizationId}
          onChange={onOrganizationId}
          all="Choose a firm"
          options={items.map((firm) => ({ value: firm.id, label: firm.display_name }))}
        />
      ) : (
        <Alert tone="warn" title="No firm is currently accepting introductions.">Send stays off until a firm is opted in and eligible.</Alert>
      )}
    </>
  );
}
