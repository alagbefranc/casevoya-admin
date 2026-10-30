"use client";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, History, RefreshCw } from "lucide-react";
import { api, withQuery } from "@/client/api";
import { useAdmin } from "@/client/app";
import { useFirmFilter } from "@/client/firm-filter";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { dash, short, when } from "@/client/format";
import { ACTION_PREFIX, AUDIT_FAMILIES, localToIso, rangeError } from "@/client/records";
import { Badge, Empty, ErrorAlert, FilterBar, FilteredEmpty, NotBuilt, PageHeader, Panel, SearchField, Section, SelectField, SkeletonRows } from "@/components/ui";

type Cursor = { before_at: string; before_id: string };
type Event = { id: string; occurred_at: string; action: string; result: "success" | "denied" | "failure"; actor_type: string | null; actor_user_id: string | null; actor_email: string | null; organization_id: string | null; firm_name: string | null; object_table: string | null; object_id: string | null; request_id: string | null; context: Record<string, unknown> | null; diff_keys: string[] | null };
type AuditPage = { items: Event[]; limit: number; next_cursor: Cursor | null };
type AdminLite = { admins: { user_id: string; email: string }[] };
const LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULT_TONE = { success: "ok", denied: "warn", failure: "bad" } as const;

export default function AuditLogPage() {
  const { me } = useAdmin();
  const [q, setQ] = useQueryState();
  const firm = useFirmFilter();
  const family = q.get("action") ?? "";
  const actor = q.get("actor") ?? "";
  const result = q.get("result") ?? "";
  const objectId = q.get("object") ?? "";
  const fromLocal = q.get("from") ?? "";
  const toLocal = q.get("to") ?? "";
  // The actor list comes from /admins, which only owners can read; others filter without it.
  const admins = useApi<AdminLite>(me.capabilities.manageAdmins ? "/admins" : null);
  const from = localToIso(fromLocal);
  const to = localToIso(toLocal);
  const range = rangeError(from, to);
  const badPrefix = family && !ACTION_PREFIX.test(family) ? "Use an action prefix like admin_portal. or template." : null;
  const badObject = objectId && !UUID.test(objectId) ? "Enter a full object id" : null;
  const params = { actionPrefix: family || null, actorUserId: actor || null, organizationId: firm.firmId, objectId: objectId || null, result: result || null, from, to };
  const path = range || badPrefix || badObject ? null : withQuery("/audit", { ...params, limit: LIMIT });
  const active = [family, actor, result, objectId, fromLocal, toLocal, firm.firmId].filter(Boolean).length;
  const familyOptions: { value: string; label: string }[] = AUDIT_FAMILIES.map((f) => ({ value: f, label: f }));
  if (family && !AUDIT_FAMILIES.includes(family as (typeof AUDIT_FAMILIES)[number])) familyOptions.push({ value: family, label: family });

  return (
    <>
      <PageHeader title="Audit log" lede="Platform actions only: support access, notices, licence checks, templates, retries, admins and settings. Firm content never appears here."
        actions={<button type="button" className="btn" onClick={() => refreshAll()}><RefreshCw className="ic" aria-hidden /> Refresh</button>} />
      <FilterBar active={active}>
        <SearchField id="a-object" label="Object id" placeholder="Paste an object id" value={objectId} onChange={(v) => setQ({ object: v || null })} />
        <SelectField id="a-action" label="Action" all="All families" value={family} onChange={(v) => setQ({ action: v || null })} options={familyOptions} />
        <div className="fld fld-firm">{firm.field("a-firm")}</div>
        {admins.data ? (
          <SelectField id="a-actor" label="Actor" all="Anyone" value={actor} onChange={(v) => setQ({ actor: v || null })} options={admins.data.admins.map((a) => ({ value: a.user_id, label: a.email }))} />
        ) : null}
        <SelectField id="a-result" label="Result" value={result} onChange={(v) => setQ({ result: v || null })} options={[{ value: "success", label: "Success" }, { value: "denied", label: "Denied" }, { value: "failure", label: "Failure" }]} />
        <div className="fld"><label htmlFor="a-from">From</label><input id="a-from" className="inp" type="datetime-local" value={fromLocal} onChange={(e) => setQ({ from: e.target.value || null })} /></div>
        <div className="fld"><label htmlFor="a-to">To</label><input id="a-to" className="inp" type="datetime-local" value={toLocal} onChange={(e) => setQ({ to: e.target.value || null })} /></div>
      </FilterBar>
      {range || badPrefix || badObject ? <div className="summary" role="alert"><b>Check the filters</b>{[range, badPrefix, badObject].filter(Boolean).join(" ")}</div> : null}
      <Panel title="Events" icon={<History className="ic" aria-hidden />}>
        {path ? <Results key={path} path={path} params={params} filtered={active > 0} onClear={() => setQ({ action: null, actor: null, result: null, object: null, from: null, to: null, firm: null, firmName: null })} /> : <Empty title="Fix the filters to see events." />}
      </Panel>
      <p className="foot">Times in your local time zone. Reads are not audited. Export: <NotBuilt /></p>
    </>
  );
}

function Results({ path, params, filtered, onClear }: { path: string; params: Record<string, string | null>; filtered: boolean; onClear: () => void }) {
  const first = useApi<AuditPage>(path);
  const [more, setMore] = useState<AuditPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section loaded={first} skeleton={<SkeletonRows n={8} />}>
      {(p) => {
        const pages = [p, ...more];
        const items = pages.flatMap((x) => x.items);
        const cursor = pages[pages.length - 1].next_cursor;
        const loadMore = async () => {
          if (!cursor) return;
          setLoading(true);
          setError(null);
          try {
            const next = await api.get<AuditPage>(withQuery("/audit", { ...params, beforeAt: cursor.before_at, beforeId: cursor.before_id, limit: LIMIT }));
            setMore((m) => [...m, next]);
          } catch (e) {
            setError(e);
          } finally {
            setLoading(false);
          }
        };
        if (!items.length && !cursor) return filtered ? <FilteredEmpty onClear={onClear} /> : <Empty title="No audit events match." />;
        return (
          <>
            <div className="tw">
              <table className="dt audit">
                <caption className="sr-only">Audit events</caption>
                <thead><tr><th scope="col"><span className="sr-only">Expand</span></th><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Actor</th><th scope="col">Firm</th><th scope="col">Object</th><th scope="col">Request id</th></tr></thead>
                <tbody>
                  {items.map((e) => {
                    const isOpen = open === e.id;
                    const canExpand = Boolean(e.context || e.diff_keys?.length);
                    return (
                      <Fragment key={e.id}>
                        <tr>
                          <td data-l="">{canExpand ? (
                            <button type="button" className="btn ghost sm icon" aria-expanded={isOpen} aria-label={isOpen ? "Hide details" : "Show details"} onClick={() => setOpen(isOpen ? null : e.id)}>
                              {isOpen ? <ChevronDown className="ic" aria-hidden /> : <ChevronRight className="ic" aria-hidden />}
                            </button>
                          ) : null}</td>
                          <td data-l="Time" className="first">{when(e.occurred_at)}</td>
                          <td data-l="Action"><span className="mono">{e.action}</span></td>
                          <td data-l="Result"><Badge tone={RESULT_TONE[e.result] ?? "neutral"}>{e.result}</Badge></td>
                          <td data-l="Actor">{e.actor_email ?? e.actor_type ?? dash}</td>
                          <td data-l="Firm">{e.firm_name ?? dash}</td>
                          <td data-l="Object"><span className="mono">{e.object_table ? `${e.object_table}${e.object_id ? ` · ${short(e.object_id)}` : ""}` : dash}</span></td>
                          <td data-l="Request id"><span className="mono">{e.request_id ?? dash}</span></td>
                        </tr>
                        {isOpen ? (
                          <tr className="expand">
                            <td colSpan={8}>
                              {e.context ? <pre className="json">{JSON.stringify(e.context, null, 2)}</pre> : <p className="muted" style={{ margin: 0 }}>Context is not shown for this family.</p>}
                              {e.diff_keys?.length ? <p style={{ margin: "8px 0 0" }}>Changed fields: <span className="mono">{e.diff_keys.join(", ")}</span></p> : null}
                              {e.object_id ? <p className="muted" style={{ margin: "8px 0 0" }}>Object id <span className="mono">{e.object_id}</span></p> : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {loading ? <SkeletonRows n={3} /> : null}
            {error ? <div className="pad"><ErrorAlert error={error} /></div> : null}
            <div className="pager">
              <span>{items.length} {items.length === 1 ? "event" : "events"} · newest first{cursor ? "" : " · end of log"}</span>
              {cursor ? <button type="button" className="btn sm" disabled={loading} onClick={() => void loadMore()}>{loading ? "Loading…" : "Load more"}</button> : null}
            </div>
          </>
        );
      }}
    </Section>
  );
}
