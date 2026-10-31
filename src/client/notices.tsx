"use client";
import { useState } from "react";
import { ApiFailure, api } from "./api";
import { CanOperate, useAdmin } from "./app";
import { ConfirmDialog } from "./confirm";
import { FirmPicker, type PickedFirm } from "./firm-picker";
import { refreshAll, useApi } from "./hooks";
import { splitIssues } from "./session-rules";
import { duration, plural, when, words } from "./format";
import { ErrorSummary, Alert, Badge, Drawer, ErrorAlert, Field, NotBuilt, Section, SkeletonRows, Status, TextArea, Timeline, type Tone } from "@/components/ui";

export type Notice = {
  id: string; kind: string; severity: string; title: string; body: string; starts_at: string | null; ends_at: string | null; status: string; audience: string;
  published_at: string | null; resolved_at: string | null; resolved_by?: string | null; resolution_note: string | null; created_at: string; updated_at: string;
  version?: number; phase: string; duration_minutes?: number | null; targets?: { id: string; display_name: string }[];
};
type AuditRow = { id?: string; at?: string; occurred_at?: string; action: string; actor_email?: string | null; result?: string | null };
type NoticeDetail = { notice: Notice; history: { items: AuditRow[]; limit: number; next_cursor: string | null } };

export const severityTone = (s: string): Tone => (s === "major" ? "bad" : s === "minor" ? "warn" : "info");
export const kindLabel = (k: string) => words(k);

export function PhaseBadge({ n }: { n: Pick<Notice, "phase"> }) {
  if (n.phase === "ended") return <Badge tone="warn">Ended · not resolved</Badge>;
  const tone: Tone = n.phase === "live" ? "bad" : n.phase === "scheduled" ? "info" : n.phase === "resolved" ? "ok" : "neutral";
  return <Badge tone={tone}>{words(n.phase)}</Badge>;
}

export function audienceText(n: Pick<Notice, "audience" | "targets">): string {
  if (n.audience === "all") return "All firms";
  return n.targets ? plural(n.targets.length, "firm") : "Listed firms";
}

/** ISO → value for a datetime-local input, in the viewer's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local value (viewer's zone) → ISO with zone, or null when empty. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function NoticeDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (n: Notice) => void }) {
  const detail = useApi<NoticeDetail>(`/notices/${id}`);
  const [resolving, setResolving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const n = detail.data?.notice;
  return (
    <>
      <Drawer open title={n?.title ?? "Notice"} onClose={onClose} footer={n && n.status !== "resolved" ? (
        <CanOperate>
          <button type="button" className="btn" onClick={() => onEdit(n)}>Edit</button>
          {n.status === "draft" ? <button type="button" className="btn primary" onClick={() => setPublishing(true)}>Publish</button> : null}
          {n.status === "published" ? <button type="button" className="btn primary" onClick={() => setResolving(true)}>Resolve</button> : null}
        </CanOperate>
      ) : null}>
        <Section loaded={detail} skeleton={<SkeletonRows n={6} />} notFound={<Alert tone="warn" title="This notice does not exist." />}>
          {({ notice, history }) => (
            <>
              <div className="badges" style={{ marginBottom: 12 }}>
                <Badge tone={notice.kind === "maintenance" ? "info" : notice.kind === "incident" ? "warn" : "neutral"}>{kindLabel(notice.kind)}</Badge>
                <Badge tone={severityTone(notice.severity)}>{words(notice.severity)}</Badge>
                <PhaseBadge n={notice} />
              </div>
              {notice.phase === "ended" ? <Alert tone="warn" title="Ended but not resolved: add a resolution note">Firms still see it as ongoing.</Alert> : null}
              <dl className="dl">
                <div><dt>Starts</dt><dd>{when(notice.starts_at ?? notice.published_at)}</dd></div>
                <div><dt>Ends</dt><dd>{when(notice.ends_at)}</dd></div>
                <div><dt>Resolved</dt><dd>{when(notice.resolved_at)}</dd></div>
                <div><dt>Duration</dt><dd>{notice.duration_minutes != null ? duration(notice.duration_minutes * 60) : notice.status === "resolved" ? "—" : "Ongoing"}</dd></div>
                <div><dt>Audience</dt><dd>{audienceText(notice)}</dd></div>
                <div><dt>Status</dt><dd><Status value={notice.status} /></dd></div>
              </dl>
              {notice.audience === "listed" && notice.targets?.length ? <p style={{ fontSize: 13.5 }}>{notice.targets.map((t) => t.display_name).join(", ")}</p> : null}
              <h3 className="h3">Firms see</h3>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>“{notice.title}. {notice.body}”</p>
              {notice.resolution_note ? (<><h3 className="h3">Resolution note</h3><p style={{ margin: 0 }}>{notice.resolution_note}</p></>) : null}
              <h3 className="h3">History</h3>
              {history.items.length ? (
                <Timeline items={history.items.map((h, i) => ({ key: h.id ?? String(i), at: h.at ?? h.occurred_at ?? null, title: words(h.action.replace(/^(admin_portal\.notices|service_notice)\./, "")), meta: [h.actor_email, h.result].filter(Boolean).join(" · ") }))} />
              ) : <p className="muted" style={{ margin: 0 }}>No history yet.</p>}
              <p className="muted" style={{ fontSize: 12.5 }}>Deleting or unpublishing a notice: <NotBuilt />. Postmortems and incident timelines: <NotBuilt />.</p>
            </>
          )}
        </Section>
      </Drawer>
      {resolving && n ? (
        <ConfirmDialog title={`Resolve “${n.title}”?`} confirmLabel="Resolve" reason={{ label: "Resolution note", min: 3, max: 1000, hint: "Firms will see this note." }} successToast="Notice resolved" stepUp
          onConfirm={({ reason, code }) => api.post(`/notices/${n.id}/resolve`, { resolutionNote: reason, code })} onClose={() => setResolving(false)}>
          <p style={{ margin: 0 }}>The notice becomes read-only. Firms see it as resolved with your note.</p>
        </ConfirmDialog>
      ) : null}
      {publishing && n ? (
        <ConfirmDialog title={n.audience === "all" ? "Publish to all firms?" : `Publish to ${audienceText(n).toLowerCase()}?`} confirmLabel="Publish" successToast="Notice published" stepUp
          onConfirm={({ code }) => api.patch(`/notices/${n.id}`, { publish: true, code })} onClose={() => setPublishing(false)}>
          <p style={{ margin: 0 }}>Staff of the targeted firms will see this notice in Casevoya from {when(n.starts_at ?? new Date().toISOString())}.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

const FIELDS = ["kind", "severity", "title", "body", "startsAt", "endsAt", "audience", "organizationIds"];

/** Post or edit a notice (spec 2.6). Edit sends only changed fields. */
export function NoticeForm({ editing, prefillFirm, onClose }: { editing: Notice | null; prefillFirm: string | null; onClose: () => void }) {
  const { toast, withAuth, online, now } = useAdmin();
  const prefill = useApi<{ firm: PickedFirm }>(prefillFirm && !editing ? `/firms/${prefillFirm}` : null);
  const [kind, setKind] = useState(editing?.kind ?? "incident");
  const [severity, setSeverity] = useState(editing?.severity ?? "minor");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [starts, setStarts] = useState(toLocalInput(editing?.starts_at));
  const [ends, setEnds] = useState(toLocalInput(editing?.ends_at));
  const [audienceSel, setAudience] = useState<string | null>(editing?.audience ?? null);
  const [pickedFirms, setFirms] = useState<PickedFirm[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const pre = prefill.data?.firm;
  const audience = audienceSel ?? (prefillFirm ? "listed" : "all");
  const firms = pickedFirms ?? (pre ? [{ id: pre.id, display_name: pre.display_name }] : []);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, FIELDS) : null;
  const err = (k: string) => issues?.byField[k] ?? null;
  const startIso = fromLocalInput(starts);
  const endIso = fromLocalInput(ends);
  const localProblem =
    kind === "maintenance" && !endIso ? "Maintenance needs an end time." :
    endIso && Date.parse(endIso) <= (startIso ? Date.parse(startIso) : now * 1000) ? "The end time must be after the start time." :
    audience === "listed" && !editing && firms.length === 0 ? "Choose at least one firm, or all firms." : null;
  const valid = title.trim().length >= 3 && title.length <= 120 && body.trim().length >= 1 && body.length <= 1000 && !localProblem;
  const dirty = editing ? title !== editing.title || body !== editing.body || severity !== editing.severity || starts !== toLocalInput(editing.starts_at) || ends !== toLocalInput(editing.ends_at) : Boolean(title || body);

  const payload = (publish: boolean) => {
    if (editing) {
      const out: Record<string, unknown> = {};
      if (severity !== editing.severity) out.severity = severity;
      if (title.trim() !== editing.title) out.title = title.trim();
      if (body.trim() !== editing.body) out.body = body.trim();
      if (starts !== toLocalInput(editing.starts_at)) out.startsAt = startIso;
      if (ends !== toLocalInput(editing.ends_at)) out.endsAt = endIso;
      if (publish && editing.status === "draft") out.publish = true;
      return out;
    }
    return { kind, severity, title: title.trim(), body: body.trim(), startsAt: startIso, endsAt: endIso, audience, organizationIds: audience === "listed" ? firms.map((f) => f.id) : [], publish };
  };
  const send = async (publish: boolean, code?: string) => {
    const body = { ...payload(publish), ...(code ? { code } : {}) };
    const out = editing ? await api.patch(`/notices/${editing.id}`, body) : await api.post("/notices", body);
    refreshAll();
    toast(editing ? (publish && editing.status === "draft" ? "Notice published" : "Notice updated") : publish ? "Notice published" : "Draft saved");
    onClose();
    return out;
  };
  const saveDraft = async () => {
    setBusy(true);
    setError(null);
    try { await withAuth(() => send(false)); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const publishes = !editing || editing.status === "draft";
  const audienceLabel = audience === "all" ? "all firms" : plural(firms.length || editing?.targets?.length || 0, "firm");

  return (
    <>
      <Drawer open title={editing ? "Edit notice" : "Post a notice"} onClose={onClose} dirty={dirty} footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {!editing || editing.status === "draft" ? <button type="button" className="btn" disabled={!valid || busy || !online || (editing ? !dirty : false)} onClick={() => void saveDraft()}>{editing ? "Save draft" : "Save as draft"}</button> : null}
          {publishes
            ? <button type="button" className="btn primary" disabled={!valid || busy || !online} onClick={() => setConfirmPublish(true)}>Publish</button>
            : <button type="button" className="btn primary" disabled={!valid || busy || !online || !dirty} onClick={() => void saveDraft()}>Save changes</button>}
        </>
      }>
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          <ErrorSummary issues={issues} ids={{ title: "n-title", body: "n-body", startsAt: "n-start", endsAt: "n-end", organizationIds: "n-firms" }} />
          {!editing ? (
            <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Kind</legend>
              <div className="radios">{["incident", "maintenance", "info"].map((k) => <label key={k}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />{words(k)}</label>)}</div>
            </fieldset>
          ) : <p style={{ margin: 0 }}><Badge>{kindLabel(editing.kind)}</Badge> <span className="muted">Kind and audience cannot change after posting.</span></p>}
          <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Severity</legend>
            <div className="radios">{["info", "minor", "major"].map((k) => <label key={k}><input type="radio" name="severity" checked={severity === k} onChange={() => setSeverity(k)} />{words(k)}</label>)}</div>
          </fieldset>
          <Field id="n-title" label="Title" hint="3 to 120 characters." error={err("title")}>
            <input id="n-title" className="inp" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <TextArea id="n-body" label="Body" hint="What firms will read. 1 to 1000 characters." max={1000} value={body} onChange={setBody} error={err("body")} rows={4} />
          <div className="row2">
            <Field id="n-start" label="Starts" hint="Empty means now." error={err("startsAt")}>
              <input id="n-start" className="inp" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </Field>
            <Field id="n-end" label={kind === "maintenance" ? "Ends" : "Ends (optional)"} error={err("endsAt")}>
              <input id="n-end" className="inp" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </Field>
          </div>
          {!editing ? (
            <>
              <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Audience</legend>
                <div className="radios">
                  <label><input type="radio" name="aud" checked={audience === "all"} onChange={() => setAudience("all")} />All firms</label>
                  <label><input type="radio" name="aud" checked={audience === "listed"} onChange={() => setAudience("listed")} />Choose firms</label>
                </div>
              </fieldset>
              {audience === "listed" ? <FirmPicker id="n-firms" label="Firms" multi value={firms} onChange={setFirms} error={err("organizationIds")} /> : null}
            </>
          ) : null}
          {localProblem && (title || body) ? <p className="muted" style={{ margin: 0, color: "var(--warn)" }}>{localProblem}</p> : null}
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No email is sent for notices. Firms see them in Casevoya&apos;s service banner during the window.</p>
          {error && !issues ? (error instanceof ApiFailure && ["conflict", "forbidden", "not_found"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
        </form>
      </Drawer>
      {confirmPublish ? (
        <ConfirmDialog title={`Publish to ${audienceLabel}?`} confirmLabel="Publish" stepUp
          onConfirm={({ code }) => send(true, code)} onClose={() => setConfirmPublish(false)}>
          <p style={{ margin: 0 }}>Every targeted firm&apos;s staff will see this notice in Casevoya from {startIso ? when(startIso) : "now"}.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
