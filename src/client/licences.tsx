"use client";
import { useState } from "react";
import { ApiFailure, api } from "./api";
import { useAdmin } from "./app";
import { refreshAll } from "./hooks";
import { num, short, when, words } from "./format";
import { fromLocalInput, toLocalInput } from "./notices";
import { CSV_MAX_BYTES, REGISTER_HOST, isRegisterUrl, previewResult } from "./licence-rules";
import { splitIssues, stepUpNeed } from "./session-rules";
import { ErrorSummary, Alert, Badge, CodeInput, Dialog, Drawer, ErrorAlert, Field, TextArea, statusLabel, statusTone } from "@/components/ui";

export type Credential = {
  id: string; organization_id: string; firm_name: string; licence_type: string; college_id: string; status: string; register_status: string | null;
  entitlement_to_practise: boolean | null; discipline_suspended: boolean | null; discipline_revoked: boolean | null; discipline_restricted: boolean | null;
  discipline_restriction_detail: string | null; verification_method: string | null; source_url: string | null; declared_at: string | null;
  checked_at: string | null; next_review_at: string | null; valid_until: string | null; bucket?: string | null; member_role?: string | null;
};
export type Check = { id: string; result: string; retrieved_at: string | null; source_host: string | null; method: string | null; register_status: string | null; reviewer_email: string | null; proof_locator: string | null; created_at: string; cicc_import_id: string | null };
export type CredentialDetail = { credential: Credential; checks: Check[]; change_reports: { id: string; created_at: string; [k: string]: unknown }[] };

const CHECK_FIELDS = ["sourceUrl", "retrievedAt", "registerStatus", "entitledToPractise", "disciplineSuspended", "disciplineRevoked", "disciplineRestricted", "restrictionDetail", "proofLocator", "notes", "code"];

/** Record manual check (spec 2.11): operators, step-up, result preview in the database's order. */
export function ManualCheckDrawer({ credential, onClose }: { credential: Credential; onClose: () => void }) {
  const { me, now, withAuth, toast, online } = useAdmin();
  const [sourceUrl, setSourceUrl] = useState("");
  const [retrieved, setRetrieved] = useState(() => toLocalInput(new Date(now * 1000).toISOString()));
  const [registerStatus, setRegisterStatus] = useState<"" | "active" | "inactive">("");
  const [entitled, setEntitled] = useState(true);
  const [suspended, setSuspended] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [detail, setDetail] = useState("");
  const [proof, setProof] = useState("");
  const [notes, setNotes] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inlineCode = stepUpNeed(me.session, now) === "code";
  const result = previewResult({ registerStatus, entitledToPractise: entitled, disciplineSuspended: suspended, disciplineRevoked: revoked, disciplineRestricted: restricted });
  const retrievedIso = fromLocalInput(retrieved);
  const future = retrievedIso !== null && Date.parse(retrievedIso) > (now + 60) * 1000;
  const urlBad = sourceUrl.trim() !== "" && !isRegisterUrl(sourceUrl);
  const detailBad = restricted ? !detail.trim() : Boolean(detail.trim());
  const valid = isRegisterUrl(sourceUrl) && retrievedIso && !future && registerStatus && proof.trim() && proof.length <= 500 && !detailBad && detail.length <= 1000 && notes.length <= 1000 && (!inlineCode || code.length === 6);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, CHECK_FIELDS) : null;
  const err = (k: string) => issues?.byField[k] ?? null;
  const dirty = Boolean(sourceUrl || registerStatus || proof || notes || detail);
  const registerSearch = `https://${REGISTER_HOST}/`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await withAuth((retry) => api.post<{ checkId: string; credential: CredentialDetail }>(`/licences/credentials/${credential.id}/checks`, {
        sourceUrl: sourceUrl.trim(), retrievedAt: retrievedIso, registerStatus, entitledToPractise: entitled,
        disciplineSuspended: suspended, disciplineRevoked: revoked, disciplineRestricted: restricted,
        restrictionDetail: restricted ? detail.trim() : null, proofLocator: proof.trim(), notes: notes.trim() || null,
        code: inlineCode && !retry && code ? code : undefined,
      }));
      refreshAll();
      const recorded = out.credential?.checks?.[0]?.result ?? result;
      toast(`Check recorded: ${statusLabel(recorded)}`);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Drawer open title="Record manual check" onClose={onClose} dirty={dirty} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="check-form" className="btn primary" disabled={!valid || busy || !online}>{busy ? "Recording…" : "Record check"}</button>
      </>
    }>
      <form id="check-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <ErrorSummary issues={issues} ids={{ sourceUrl: "c-url", retrievedAt: "c-at", registerStatus: "c-reg", restrictionDetail: "c-detail", proofLocator: "c-proof", notes: "c-notes", code: "c-code" }} />
        <p className="muted" style={{ margin: 0 }}>Look up <span className="mono">{credential.college_id}</span> on <a href={registerSearch} target="_blank" rel="noreferrer noopener">{REGISTER_HOST}</a> and record what it shows.</p>
        <Field id="c-url" label="Register page link" hint={`https on ${REGISTER_HOST} only.`} error={err("sourceUrl") ?? (urlBad ? `Licence evidence must cite https://${REGISTER_HOST}` : null)}>
          <input id="c-url" className="inp" type="url" inputMode="url" placeholder={`https://${REGISTER_HOST}/…`} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </Field>
        <Field id="c-at" label="Retrieved at" hint="Your time zone. Not in the future." error={err("retrievedAt") ?? (future ? "The retrieval time is in the future" : null)}>
          <input id="c-at" className="inp" type="datetime-local" value={retrieved} onChange={(e) => setRetrieved(e.target.value)} />
        </Field>
        <Field id="c-reg" label="Register status" error={err("registerStatus")}>
          <select id="c-reg" className="sel" value={registerStatus} onChange={(e) => setRegisterStatus(e.target.value as "" | "active" | "inactive")}>
            <option value="">Choose…</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <div style={{ display: "grid", gap: 8 }}>
          <label className="check"><input type="checkbox" checked={entitled} onChange={(e) => setEntitled(e.target.checked)} />Entitled to practise</label>
          <label className="check"><input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} />Suspended</label>
          <label className="check"><input type="checkbox" checked={revoked} onChange={(e) => setRevoked(e.target.checked)} />Revoked</label>
          <label className="check"><input type="checkbox" checked={restricted} onChange={(e) => { setRestricted(e.target.checked); if (!e.target.checked) setDetail(""); }} />Restricted</label>
        </div>
        <TextArea id="c-detail" label="Restriction detail" hint={restricted ? "Required: copy the restriction from the register." : "Only when restricted."} max={1000} value={detail} onChange={setDetail} error={err("restrictionDetail")} rows={2} />
        <Field id="c-proof" label="Where the proof is kept" hint="Screenshot or PDF location. Required." error={err("proofLocator")}>
          <input id="c-proof" className="inp" maxLength={500} placeholder="Screenshot file name or storage path" value={proof} onChange={(e) => setProof(e.target.value)} />
        </Field>
        <TextArea id="c-notes" label="Notes (optional)" max={1000} value={notes} onChange={setNotes} error={err("notes")} rows={2} />
        {inlineCode ? <div className="codebox-wrap"><p>Your last authenticator check is older than 15 minutes.</p><CodeInput id="c-code" value={code} onChange={setCode} error={err("code")} /></div> : null}
        {result ? (
          <Alert tone={statusTone(result)} title={<>Result preview: {statusLabel(result)}</>}>
            {result === "verified" ? "Next review is set from the licence re-check interval in Config." : "An adverse result tells the firm and can restrict it if no verified licence is left."}
          </Alert>
        ) : null}
        {error && !issues ? <ErrorAlert error={error} /> : null}
      </form>
    </Drawer>
  );
}

type CsvSummary = { mapped: Record<string, string>; keptAsFields: string[]; rows: number; skippedWithoutNumber: number; statuses: Record<string, number>; unrecognisedStatuses: string[] };
type ImportOut = { dryRun: boolean; sha256: string; summary: CsvSummary; importId: string | null; result: { import_id: string; row_count: number; checked: number; verified: number; needs_review: number; adverse: number } | null };

/** Upload CICC list (spec 2.11): dry run first, then Import with a confirmation. */
export function CiccUploadDrawer({ onClose }: { onClose: () => void }) {
  const { withAuth, toast, online } = useAdmin();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [locator, setLocator] = useState("");
  const [dry, setDry] = useState<ImportOut | null>(null);
  const [done, setDone] = useState<ImportOut | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, ["csv", "sourceNote", "fileName", "fileLocator"]) : null;
  const ready = Boolean(file) && note.trim().length >= 1 && note.length <= 500 && locator.length <= 500;

  const pick = async (f: File | undefined) => {
    setDry(null);
    setError(null);
    setFile(null);
    setFileError(null);
    if (!f) return;
    if (f.size > CSV_MAX_BYTES) return setFileError("The file is larger than 8 MB");
    setFile({ name: f.name, text: await f.text() });
  };

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const out = await withAuth(() => api.post<ImportOut>("/licences/cicc-imports", { sourceNote: note.trim(), fileName: file.name, fileLocator: locator.trim() || null, csv: file.text, dryRun }));
      if (dryRun) setDry(out);
      else {
        setDone(out);
        refreshAll();
        toast(`Imported ${num(out.result?.row_count ?? out.summary.rows)} rows`);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const s = dry?.summary;
  return (
    <Drawer open title="Upload CICC list" onClose={onClose} dirty={Boolean(file || note) && !done} footer={
      done ? <button type="button" className="btn primary" onClick={onClose}>Done</button> : (
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {dry ? <button type="button" className="btn primary" disabled={busy || !online || !ready} onClick={() => setConfirming(true)}>Import</button>
            : <button type="button" className="btn primary" disabled={busy || !online || !ready} onClick={() => void send(true)}>{busy ? "Checking…" : "Dry run"}</button>}
        </>
      )
    }>
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>Step {dry ? 2 : 1} of 2. {dry ? "Check the summary, then import." : "Nothing is saved yet."}</p>
        <Field id="u-file" label="CSV file" hint="The College's register export. Up to 8 MB and 20,000 rows." error={fileError ?? issues?.byField.csv ?? null}>
          <input id="u-file" className="inp" type="file" accept=".csv,text/csv" disabled={Boolean(done)} onChange={(e) => void pick(e.target.files?.[0])} />
        </Field>
        <TextArea id="u-note" label="Source note" hint="Where the list came from (1 to 500 characters)." max={500} value={note} onChange={(v) => { setNote(v); setDry(null); }} error={issues?.byField.sourceNote ?? null} rows={2} />
        <Field id="u-loc" label="File location (optional)" hint="Where the original file is kept." error={issues?.byField.fileLocator ?? null}>
          <input id="u-loc" className="inp" maxLength={500} value={locator} onChange={(e) => setLocator(e.target.value)} />
        </Field>
        {s ? (
          <section className="panel" style={{ margin: 0 }} aria-label="Dry run summary">
            <div className="pad">
              <dl className="dl">
                <div><dt>Rows</dt><dd>{num(s.rows)}</dd></div>
                <div><dt>Skipped (no licence number)</dt><dd>{num(s.skippedWithoutNumber)}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>Mapped columns</dt><dd>{Object.entries(s.mapped).map(([k, v]) => `${words(k)} ← ${v}`).join(" · ") || "—"}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>Extra columns kept</dt><dd>{s.keptAsFields.join(", ") || "None"}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>Statuses</dt><dd className="badges">{Object.entries(s.statuses).map(([k, n]) => <Badge key={k} tone={s.unrecognisedStatuses.includes(k) ? "warn" : "neutral"}>{k} {num(n)}</Badge>)}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>SHA-256</dt><dd className="mono">{dry?.sha256}</dd></div>
              </dl>
              {s.unrecognisedStatuses.length ? <div style={{ marginTop: 10 }}><Alert tone="warn" title="Unrecognised statuses">Credentials with {s.unrecognisedStatuses.join(", ")} will need review.</Alert></div> : null}
            </div>
          </section>
        ) : null}
        {done?.result ? (
          <Alert tone="ok" title={`Import ${short(done.result.import_id)} complete`}>
            {num(done.result.row_count)} rows · {num(done.result.checked)} credentials checked: {num(done.result.verified)} verified, {num(done.result.needs_review)} need review, {num(done.result.adverse)} adverse.
          </Alert>
        ) : null}
        {issues?.summary.length ? <div className="summary" role="alert"><b>Check the file</b>{issues.summary.join(" ")}</div> : null}
        {error && !issues ? <ErrorAlert error={error} /> : null}
      </div>
      <Dialog open={confirming} title={`Import ${num(s?.rows ?? 0)} rows and re-check every credential?`} onClose={() => setConfirming(false)} footer={
        <>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !online} onClick={() => void send(false)}>{busy ? "Importing…" : "Import"}</button>
        </>
      }>
        <p style={{ margin: 0 }}>Every credential is checked against this list. A list &ldquo;verified&rdquo; never overrides an adverse manual register check. If part of the file fails, the import stays open and unused; fix the file and import again.</p>
      </Dialog>
    </Drawer>
  );
}

/** Verification method label: the CICC list keeps its acronym. */
export function methodLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return m === "cicc_list" ? "CICC list" : words(m);
}

export function CheckRow({ c }: { c: Check }) {
  return (
    <>
      <span className="badges"><Badge tone={statusTone(c.result)}>{statusLabel(c.result)}</Badge> {c.method ? methodLabel(c.method) : null}{c.reviewer_email ? ` · ${c.reviewer_email}` : ""}</span>
      <small>
        {[c.register_status && `Register ${c.register_status}`, c.source_host, c.retrieved_at && `retrieved ${when(c.retrieved_at)}`, c.proof_locator && `proof: ${c.proof_locator}`].filter(Boolean).join(" · ")}
      </small>
    </>
  );
}
