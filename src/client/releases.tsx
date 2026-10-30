"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ApiFailure, api } from "./api";
import { useAdmin } from "./app";
import { refreshAll } from "./hooks";
import { splitIssues } from "./session-rules";
import { Alert, Drawer, ErrorAlert, Field, TextArea } from "@/components/ui";

export type Body = { title: string; summary: string | null; items: string[] };
export type Source = { position: number; url: string; host: string; official: boolean; title: string | null; retrieved_on: string | null; note: string | null };
export type VersionDetail = {
  version: {
    id: string; template_id: string; stable_key: string; version_number: number; status: string; body: Body; content_hash: string | null; author_name: string | null; author_user_id: string | null;
    test_evidence: string | null; effective_on: string | null; changelog: string | null; supersedes_version_id: string | null; reviewer_label: string | null; reviewed_at: string | null; published_at: string | null; created_at: string; updated_at: string;
  };
  sources: Source[];
  reviews: { decision: string; reviewer_label: string | null; reason: string | null; decided_at: string }[];
  hints: { isAuthor: boolean; hasOfficialSource: boolean };
  diff: { version_id: string; version_number: number; status: string; before: Body | null; after: Body; changes: { field: "title" | "summary" | "items"; before: unknown; after: unknown }[] };
};

type SourceRow = { url: string; title: string; retrievedOn: string; note: string };
const FIELDS = ["stableKey", "authorName", "title", "summary", "items", "testEvidence", "effectiveOn", "changelog", "sources"];
const KEY_RE = /^[a-z][a-z0-9_]{1,60}$/;

/** New draft (POST /templates/drafts) or revise own draft (PATCH /templates/versions/:id), spec 2.7. */
export function DraftForm({ revise, startKey, onClose }: { revise: VersionDetail | null; startKey?: { key: string; title: string } | null; onClose: () => void }) {
  const router = useRouter();
  const { toast, withAuth, online } = useAdmin();
  const v = revise?.version;
  const [stableKey, setKey] = useState(v?.stable_key ?? startKey?.key ?? "");
  const [authorName, setAuthor] = useState(v?.author_name ?? "");
  const [title, setTitle] = useState(v?.body.title ?? startKey?.title ?? "");
  const [summary, setSummary] = useState(v?.body.summary ?? "");
  const [items, setItems] = useState((v?.body.items ?? []).join("\n"));
  const [evidence, setEvidence] = useState(v?.test_evidence ?? "");
  const [effectiveOn, setEffective] = useState(v?.effective_on ?? "");
  const [changelog, setChangelog] = useState(v?.changelog ?? "");
  const [sources, setSources] = useState<SourceRow[]>(revise?.sources.length ? revise.sources.map((s) => ({ url: s.url, title: s.title ?? "", retrievedOn: s.retrieved_on ?? "", note: s.note ?? "" })) : [{ url: "", title: "", retrievedOn: "", note: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const itemList = items.split("\n").map((s) => s.trim()).filter(Boolean);
  const cleanSources = sources.filter((s) => s.url.trim());
  const valid = (revise || (KEY_RE.test(stableKey) && authorName.trim().length >= 1)) && title.trim().length >= 1 && title.length <= 160 && summary.length <= 2000
    && itemList.length >= 1 && itemList.length <= 80 && itemList.every((i) => i.length <= 200) && evidence.trim().length >= 8 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)
    && changelog.trim().length >= 3 && cleanSources.length >= 1 && cleanSources.length <= 20 && cleanSources.every((s) => /^https:\/\//i.test(s.url.trim()));
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, FIELDS) : null;
  const err = (k: string) => issues?.byField[k] ?? null;
  const setSource = (i: number, patch: Partial<SourceRow>) => setSources((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(), summary: summary.trim(), items: itemList, testEvidence: evidence.trim(), effectiveOn, changelog: changelog.trim(),
      sources: cleanSources.map((s) => ({ url: s.url.trim(), ...(s.title.trim() ? { title: s.title.trim() } : {}), ...(s.retrievedOn ? { retrievedOn: s.retrievedOn } : {}), ...(s.note.trim() ? { note: s.note.trim() } : {}) })),
    };
    try {
      const out = await withAuth(() => (revise ? api.patch<VersionDetail>(`/templates/versions/${revise.version.id}`, body) : api.post<VersionDetail>("/templates/drafts", { stableKey, authorName: authorName.trim(), ...body })));
      refreshAll();
      toast(revise ? "Draft updated" : "Draft saved");
      onClose();
      router.push(`/releases/templates/${out.version.id}`);
    } catch (e) {
      const saved = e instanceof ApiFailure ? (e.details as { versionId?: string } | null)?.versionId : undefined;
      if (saved) {
        refreshAll();
        onClose();
        router.push(`/releases/templates/${saved}?sourcesFailed=${encodeURIComponent(e instanceof Error ? e.message : "")}`);
        return;
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open title={revise ? `Revise v${v?.version_number}` : "New draft"} onClose={onClose} dirty footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="draft-form" className="btn primary" disabled={!valid || busy || !online}>{busy ? "Saving…" : revise ? "Save draft" : "Save draft"}</button>
      </>
    }>
      <form id="draft-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {!revise ? (
          <div className="row2">
            <Field id="d-key" label="Template key" hint="Lower case, digits and _. A new key creates a template." error={err("stableKey") ?? (stableKey && !KEY_RE.test(stableKey) ? "Use a-z, 0-9 and _, starting with a letter (2–61)." : null)}>
              <input id="d-key" className="inp mono" value={stableKey} onChange={(e) => setKey(e.target.value)} disabled={Boolean(startKey)} />
            </Field>
            <Field id="d-author" label="Author name" error={err("authorName")}>
              <input id="d-author" className="inp" maxLength={120} value={authorName} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
          </div>
        ) : null}
        <Field id="d-title" label="Title" error={err("title")}><input id="d-title" className="inp" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <TextArea id="d-summary" label="Summary (optional)" max={2000} value={summary} onChange={setSummary} error={err("summary")} rows={2} />
        <TextArea id="d-items" label="Items" hint={`One per line, 1 to 80 items of up to 200 characters. ${itemList.length} now.`} max={16000} value={items} onChange={setItems} error={err("items")} rows={6} />
        <TextArea id="d-evidence" label="Test evidence" hint="8 to 2000 characters: how you checked it." max={2000} value={evidence} onChange={setEvidence} error={err("testEvidence")} rows={2} />
        <div className="row2">
          <Field id="d-eff" label="Effective on" error={err("effectiveOn")}><input id="d-eff" className="inp" type="date" value={effectiveOn} onChange={(e) => setEffective(e.target.value)} /></Field>
          <span />
        </div>
        <TextArea id="d-change" label="Changelog" hint="3 to 2000 characters. Adopting firms see this." max={2000} value={changelog} onChange={setChangelog} error={err("changelog")} rows={2} />
        <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sources</legend>
          <span className="hint">1 to 20 https links. Publishing needs at least one on the official list.{revise ? " Saving replaces all sources." : ""}</span>
          {sources.map((s, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, marginTop: 8, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input aria-label={`Source ${i + 1} URL`} className="inp" placeholder="https://www.canada.ca/…" value={s.url} onChange={(e) => setSource(i, { url: e.target.value })} />
                <button type="button" className="btn sm" aria-label={`Remove source ${i + 1}`} disabled={sources.length === 1} onClick={() => setSources((rows) => rows.filter((_, j) => j !== i))}><Trash2 className="ic" aria-hidden /></button>
              </div>
              <div className="row2">
                <input aria-label={`Source ${i + 1} title`} className="inp" placeholder="Title (optional)" value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} />
                <input aria-label={`Source ${i + 1} retrieved on`} className="inp" type="date" value={s.retrievedOn} onChange={(e) => setSource(i, { retrievedOn: e.target.value })} />
              </div>
              <input aria-label={`Source ${i + 1} note`} className="inp" placeholder="Note (optional)" value={s.note} onChange={(e) => setSource(i, { note: e.target.value })} />
            </div>
          ))}
          {sources.length < 20 ? <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setSources((rows) => [...rows, { url: "", title: "", retrievedOn: "", note: "" }])}><Plus className="ic" aria-hidden />Add source</button> : null}
          {err("sources") ? <span className="err">{err("sources")}</span> : null}
        </fieldset>
        {issues?.summary.length ? <div className="summary" role="alert"><b>Check the form</b>{issues.summary.join(" ")}</div> : null}
        {error && !issues ? (error instanceof ApiFailure && ["conflict", "forbidden", "not_found"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
      </form>
    </Drawer>
  );
}
