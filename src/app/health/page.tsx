"use client";
import { useState } from "react";
import { Activity, AlertOctagon, CircleX, Clock, Hourglass, Inbox, Loader, RefreshCw, RotateCcw, Server } from "lucide-react";
import { api, withQuery } from "@/client/api";
import { CanOperate, useAdmin } from "@/client/app";
import { ConfirmDialog } from "@/client/confirm";
import { bytes, clock, duration, num, when } from "@/client/format";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import type { Page } from "@/client/types";
import { Alert, Badge, DataTable, Drawer, Empty, MetricCard, NotBuilt, PageHeader, Pager, Panel, Section, SelectField, SkeletonCards, SkeletonRows, Status, Timeline } from "@/components/ui";

type Health = {
  level: string;
  counts: { pending: number; processing: number; published: number; failed: number; dead_lettered: number };
  oldest_pending_at: string | null;
  oldest_pending_wait_seconds: number | null;
  processing_stuck: number;
  failed_last_hour: number;
  dead_letters_by_type: { event_type: string; count: number }[];
  thresholds: { degraded_wait_seconds: number; unhealthy_wait_seconds: number; stuck_processing_minutes: number };
  checked_at: string;
};
type DeadLetter = { id: string; event_type: string; aggregate_type: string | null; organization_id: string | null; firm_name: string | null; attempts: number; occurred_at: string; available_at: string | null; last_error: string | null };
type DeadLetterDetail = DeadLetter & {
  status: string; schema_version: number | null; aggregate_id: string | null; locked_at: string | null; published_at: string | null;
  payload_keys: string[]; payload_bytes: number | null; replays: { at: string; actor_email: string | null; result: string | null; action: string | null }[];
};

const LIMIT = 50;
const firstLine = (s: string | null) => (s ?? "").split("\n")[0].slice(0, 300) || "—";

export default function HealthPage() {
  const { me } = useAdmin();
  const [q, setQ] = useQueryState();
  const eventType = q.get("eventType") ?? "";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const open = q.get("event");
  const health = useApi<Health>("/health", { poll: 30_000 });
  const letters = useApi<Page<DeadLetter>>(withQuery("/health/dead-letters", { eventType, limit: LIMIT, offset }), { poll: (d) => (d && d.total > 0 ? 60_000 : undefined) });
  const [retry, setRetry] = useState<{ id: string; event_type: string } | null>(null);
  const h = health.data;
  const t = h?.thresholds;

  return (
    <>
      <PageHeader
        title="Health"
        badge={h ? <Status value={h.level} /> : null}
        lede={<>{h ? `Checked ${clock(h.checked_at)}. ` : ""}Background work: emails, notifications, webhooks and licence events.</>}
        actions={<button type="button" className="btn" onClick={() => refreshAll()}><RefreshCw className="ic" aria-hidden />Refresh</button>}
      />
      <Section loaded={health} skeleton={<SkeletonCards n={6} cls="g6" />}>
        {(d) => (
          <>
            <div className="grid g6">
              <MetricCard icon={<Hourglass className="ic" aria-hidden />} label="Pending" value={num(d.counts.pending)} />
              <MetricCard icon={<Loader className="ic" aria-hidden />} label="Processing" value={num(d.counts.processing)} />
              <MetricCard icon={<CircleX className="ic" aria-hidden />} label="Failed (last hour)" value={num(d.failed_last_hour)} badge={d.failed_last_hour ? <Badge tone="warn">degraded</Badge> : null} />
              <MetricCard icon={<AlertOctagon className="ic" aria-hidden />} label="Dead-lettered" value={num(d.counts.dead_lettered)} badge={d.counts.dead_lettered ? <Badge tone="bad">unhealthy</Badge> : null} />
              <MetricCard icon={<Clock className="ic" aria-hidden />} label="Oldest wait" value={d.oldest_pending_wait_seconds ? duration(d.oldest_pending_wait_seconds) : "—"} />
              <MetricCard icon={<Server className="ic" aria-hidden />} label="Stuck processing" value={num(d.processing_stuck)} badge={d.processing_stuck ? <Badge tone="warn">degraded</Badge> : null} />
            </div>
            {d.dead_letters_by_type.length ? (
              <Panel title="Dead letters by event type" icon={<Inbox className="ic" aria-hidden />}>
                <DataTable caption="Dead letters by event type" rows={d.dead_letters_by_type} rowKey={(r) => r.event_type} columns={[
                  { key: "t", label: "Event type", first: true, render: (r) => <span className="mono">{r.event_type}</span> },
                  { key: "c", label: "Count", render: (r) => num(r.count) },
                ]} />
              </Panel>
            ) : null}
          </>
        )}
      </Section>

      <div className="filters" style={{ marginTop: 14 }}>
        <SelectField id="h-type" label="Event type" all="All event types" value={eventType} onChange={(v) => setQ({ eventType: v })}
          options={(h?.dead_letters_by_type ?? []).map((r) => ({ value: r.event_type, label: r.event_type }))} />
      </div>
      <Panel title="Dead letters" icon={<Activity className="ic" aria-hidden />} right={letters.data ? `${letters.data.items.length} of ${letters.data.total}` : null}>
        <Section loaded={letters} skeleton={<SkeletonRows n={3} />}>
          {(page) => (
            <>
              <DataTable
                caption="Dead letters"
                rows={page.items}
                rowKey={(r) => r.id}
                onRowClick={(r) => setQ({ event: r.id, offset: String(offset || "") || null })}
                empty={<Empty tone="ok" title="No dead letters.">Every event was delivered or is still being tried.</Empty>}
                columns={[
                  { key: "t", label: "Event type", first: true, render: (r) => <span className="mono">{r.event_type}</span> },
                  { key: "f", label: "Firm", render: (r) => r.firm_name ?? "—" },
                  { key: "a", label: "Attempts", render: (r) => num(r.attempts) },
                  { key: "o", label: "Occurred", render: (r) => when(r.occurred_at) },
                  { key: "e", label: "Last error", render: (r) => firstLine(r.last_error) },
                  ...(me.capabilities.operate ? [{ key: "r", label: "Retry", render: (r: DeadLetter) => (
                    <button type="button" className="btn sm" onClick={() => setRetry(r)}><RotateCcw className="ic" aria-hidden />Retry</button>
                  ) }] : []),
                ]}
              />
              <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Degraded after {t ? duration(t.degraded_wait_seconds) : "10 min"} wait, any failure in the last hour or processing over {t?.stuck_processing_minutes ?? 15} min;
        unhealthy with any dead letter or over {t ? duration(t.unhealthy_wait_seconds) : "1 h"} wait. Bulk retry and discarding a dead letter: <NotBuilt />
      </p>

      {open ? <DeadLetterDrawer id={open} onClose={() => setQ({ event: null, offset: offset ? String(offset) : null })} onRetry={setRetry} /> : null}
      {retry ? (
        <ConfirmDialog
          title={`Retry this ${retry.event_type} event?`}
          confirmLabel="Retry event"
          reason={{ min: 8, max: 500 }}
          stepUp
          successToast="Queued for retry"
          onConfirm={({ reason, code }) => api.post(`/health/dead-letters/${retry.id}/retry`, { reason, ...(code ? { code } : {}) })}
          onClose={() => setRetry(null)}
        >
          <p style={{ margin: 0 }}>It will be sent again to its handler (for example, an email may go out). There is no dedupe across a manual retry.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function DeadLetterDrawer({ id, onClose, onRetry }: { id: string; onClose: () => void; onRetry: (r: { id: string; event_type: string }) => void }) {
  const detail = useApi<DeadLetterDetail>(`/health/dead-letters/${id}`);
  const d = detail.data;
  return (
    <Drawer open title={d ? <span className="mono" style={{ fontSize: 15 }}>{d.event_type}</span> : "Dead letter"} onClose={onClose}
      footer={d && d.status === "dead_lettered" ? (
        <CanOperate><button type="button" className="btn primary" onClick={() => onRetry(d)}><RotateCcw className="ic" aria-hidden />Retry</button></CanOperate>
      ) : null}>
      <Section loaded={detail} skeleton={<SkeletonRows n={6} />} notFound={<Alert tone="warn" title="This event no longer exists." />}>
        {(e) => (
          <>
            {e.status !== "dead_lettered" ? <Alert tone="info" title={`This event is ${e.status.replace(/_/g, " ")} now.`}>Someone may have retried it already.</Alert> : null}
            <dl className="dl">
              <div><dt>Status</dt><dd><Status value={e.status} /></dd></div>
              <div><dt>Attempts</dt><dd>{num(e.attempts)}</dd></div>
              <div><dt>Firm</dt><dd>{e.firm_name ?? "—"}</dd></div>
              <div><dt>Aggregate</dt><dd className="mono">{e.aggregate_type ?? "—"}</dd></div>
              <div><dt>Occurred</dt><dd>{when(e.occurred_at)}</dd></div>
              <div><dt>Available</dt><dd>{when(e.available_at)}</dd></div>
              <div><dt>Schema version</dt><dd>{e.schema_version ?? "—"}</dd></div>
              <div><dt>Payload</dt><dd>{bytes(e.payload_bytes)} · keys <span className="mono">{e.payload_keys.join(", ") || "—"}</span></dd></div>
            </dl>
            <h3 className="h3">Last error</h3>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", background: "var(--paper)", borderRadius: 12, padding: 10, fontSize: 12.5, margin: 0 }}>{e.last_error ?? "—"}</pre>
            <p className="muted" style={{ fontSize: 12.5 }}>The payload itself is never shown here: only its keys and size.</p>
            <h3 className="h3">Replays</h3>
            {e.replays.length ? (
              <Timeline items={e.replays.map((r, i) => ({ key: `${r.at}-${i}`, at: r.at, title: r.action ?? "Retry", meta: [r.actor_email, r.result].filter(Boolean).join(" · ") }))} />
            ) : <p className="muted" style={{ margin: 0 }}>Not retried yet.</p>}
          </>
        )}
      </Section>
    </Drawer>
  );
}
