"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { History, KeyRound } from "@/components/icons";
import { api } from "@/client/api";
import { CanOperate } from "@/client/app";
import { ConfirmDialog } from "@/client/confirm";
import { Countdown } from "@/client/grants";
import { useApi } from "@/client/hooks";
import { num, short, when, words } from "@/client/format";
import type { GrantRow } from "@/client/types";
import { Alert, Empty, NotBuilt, PageHeader, Panel, Section, Skeleton, SkeletonRows, Status, Timeline } from "@/components/ui";

type Detail = {
  request: GrantRow;
  firm: { id: string; display_name: string } | null;
  history: { events: { at: string; action: string; result: string | null; actor_type: string | null; actor_email: string | null }[]; uses: { at: string; action: string; object_table: string | null; actor_email: string | null }[] };
};

export default function GrantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi<Detail>(`/support/requests/${id}`, { poll: (d) => (d && ["pending", "active"].includes(d.request.state) ? 30_000 : 120_000) });
  const [cancel, setCancel] = useState(false);
  const d = detail.data;
  const g = d?.request;
  const label = g?.state === "pending" ? "Withdraw request" : g?.state === "active" ? "End access now" : null;

  return (
    <>
      <PageHeader
        crumb={<><Link href="/grants">Grants</Link> › {g?.ticket_ref ?? (g ? short(g.id) : "…")}</>}
        title={d ? <>Support access · {d.firm?.display_name ?? g?.firm_name ?? "Unknown firm"}</> : <Skeleton h={34} w={420} />}
        lede={g ? <><span className="mono">{g.scope}</span>{g.ticket_ref ? ` · ${g.ticket_ref}` : ""}</> : null}
        badge={null}
        actions={label ? <CanOperate><button type="button" className={`btn ${g?.state === "active" ? "danger" : ""}`} onClick={() => setCancel(true)}>{label}</button></CanOperate> : null}
      />
      {g ? <p style={{ margin: "-6px 0 14px", display: "flex", gap: 8, alignItems: "center" }}><Status value={g.state === "active" ? "active" : g.effective_status} />{g.state === "active" ? <Countdown grant={g} /> : null}</p> : null}
      <Section loaded={detail} skeleton={<SkeletonRows n={6} />} notFound={<Empty title="This request does not exist."><Link href="/grants">Back to grants</Link></Empty>}>
        {({ request: r, firm, history }) => (
          <div className="cols even">
            <Panel title="Request" icon={<KeyRound className="ic" aria-hidden />}>
              <div className="pad">
                <dl className="dl">
                  <div><dt>Firm</dt><dd>{firm ? <Link href={`/firms/${firm.id}`}><b>{firm.display_name}</b></Link> : r.firm_name ?? "—"}</dd></div>
                  <div><dt>Scope</dt><dd className="mono">{r.scope}</dd></div>
                  <div><dt>Matter id</dt><dd className="mono">{r.matter_id ?? "—"}</dd></div>
                  <div><dt>Ticket</dt><dd>{r.ticket_ref ?? "—"}</dd></div>
                  <div><dt>Requested by</dt><dd>{r.requested_by_name ?? "—"}{r.requested_by_email ? <small className="muted" style={{ display: "block" }}>{r.requested_by_email}</small> : null}</dd></div>
                  <div><dt>Minutes asked</dt><dd>{num(r.requested_minutes)}</dd></div>
                  <div><dt>Requested</dt><dd>{when(r.created_at)}</dd></div>
                  <div><dt>Approved</dt><dd>{when(r.approved_at)}</dd></div>
                  <div><dt>Starts</dt><dd>{when(r.starts_at)}</dd></div>
                  <div><dt>Ends</dt><dd>{when(r.ended_at ?? r.ends_at)}</dd></div>
                  <div><dt>Extensions</dt><dd>{num(r.extension_count ?? 0)}</dd></div>
                  <div><dt>Uses</dt><dd>{num(r.uses ?? 0)}</dd></div>
                </dl>
                <h3 className="h3">Reason</h3>
                <p style={{ margin: 0 }}>{r.reason ?? "—"}</p>
                {r.not_included ? (<><h3 className="h3">Not included</h3><p style={{ margin: 0 }}>{r.not_included}</p></>) : null}
                {r.decline_reason ? <div style={{ marginTop: 12 }}><Alert tone="warn" title={r.effective_status === "declined" ? "The firm declined" : "Closing reason"}>{r.decline_reason}</Alert></div> : null}
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Viewing this firm&apos;s data from the portal and extending access as an admin: <NotBuilt />. Work the ticket in Casevoya; owners extend there.</p>
              </div>
            </Panel>
            <Panel title="Timeline" icon={<History className="ic" aria-hidden />}>
              <div className="pad">
                {history.events.length || history.uses.length ? (
                  <Timeline items={[
                    ...history.events.map((e, i) => ({ key: `e${i}`, at: e.at, title: words(e.action.replace(/^support_access\.|^admin_portal\.support\./, "")), meta: [e.actor_email ?? e.actor_type, e.result].filter(Boolean).join(" · ") })),
                    ...history.uses.map((u, i) => ({ key: `u${i}`, at: u.at, title: `Used: ${words(u.action)}${u.object_table ? ` (${u.object_table})` : ""}`, meta: u.actor_email ?? undefined })),
                  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))} />
                ) : <p className="muted" style={{ margin: 0 }}>Nothing recorded yet.</p>}
              </div>
            </Panel>
          </div>
        )}
      </Section>
      {cancel && g && label ? (
        <ConfirmDialog
          title={g.state === "active" ? "End this support access now?" : "Withdraw this request?"}
          confirmLabel={label}
          danger={g.state === "active"}
          reason={{ min: 3, max: 500 }}
          successToast={g.state === "active" ? "Access ended" : "Request withdrawn"}
          stepUp
          onConfirm={({ reason, code }) => api.post(`/support/requests/${g.id}/cancel`, { reason, code })}
          onClose={() => setCancel(false)}
        >
          <p style={{ margin: 0 }}>{g.state === "active" ? "Access stops immediately. The firm's owners see that you ended it." : "The firm's owners will no longer be asked to approve it."}</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
