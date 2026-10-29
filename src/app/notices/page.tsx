import { connection } from "next/server";
import { Denied, Flash, Shell } from "@/components/shell";
import { firmNames, listNotices } from "@/lib/data";
import { flashParams, when } from "@/lib/format";
import { gate } from "@/lib/guard";
import { postNotice, resolveNotice, updateNotice } from "./actions";

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const [notices, names] = await Promise.all([listNotices(result.admin), firmNames(result.admin)]);
  const flash = flashParams(await searchParams);
  const firms = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const open = notices.filter((n) => n.status !== "resolved");
  const closed = notices.filter((n) => n.status === "resolved");
  return (
    <Shell email={result.admin.email}>
      <h1>Service notices</h1>
      <p className="lede">
        Maintenance, incident and information notices. Firm staff see a current notice as a banner on every page and in Settings ›
        Security › Service notices. Every post, update and resolve is audited with you as the acting admin. Text is plain.
      </p>
      <Flash {...flash} />

      <h2>Current and draft ({open.length})</h2>
      {open.length === 0 ? <p className="hint">None.</p> : null}
      {open.map((n) => (
        <details key={n.id} className="card" style={{ marginBottom: 10 }}>
          <summary>
            <span className={`pill ${n.severity === "major" ? "bad" : n.severity === "minor" ? "warn" : ""}`}>{n.kind} · {n.severity}</span>{" "}
            <strong>{n.title}</strong> <span className="pill">{n.status}</span>{" "}
            <span className="hint">{when(n.startsAt)} → {when(n.endsAt)} · {n.audience === "all_firms" ? "all firms" : n.firmIds.map((id) => names.get(id) ?? id).join(", ")}</span>
          </summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
          <form action={updateNotice} className="stack">
            <input type="hidden" name="id" value={n.id} />
            <label>Title<input name="title" defaultValue={n.title} maxLength={120} /></label>
            <label>Text<textarea name="body" defaultValue={n.body} maxLength={1000} rows={3} /></label>
            <label>Severity
              <select name="severity" defaultValue={n.severity}><option>info</option><option>minor</option><option>major</option></select>
            </label>
            <label>New start (EST, UTC−5) <span className="hint">blank keeps it</span><input type="datetime-local" name="startsAt" /></label>
            <label>New end (EST, UTC−5) <span className="hint">blank keeps it</span><input type="datetime-local" name="endsAt" /></label>
            {n.status === "draft" ? <label className="inline"><input type="checkbox" name="publish" value="yes" /> Publish now</label> : null}
            <div><button type="submit">Save changes</button></div>
          </form>
          <form action={resolveNotice} className="stack" style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={n.id} />
            <label>Resolution note<textarea name="note" required maxLength={1000} rows={2} /></label>
            <div><button type="submit" className="secondary">Resolve</button></div>
          </form>
        </details>
      ))}

      <h2>Post a notice</h2>
      <form action={postNotice} className="stack">
        <label>Kind
          <select name="kind" defaultValue="incident"><option value="maintenance">maintenance</option><option value="incident">incident</option><option value="info">info</option></select>
        </label>
        <label>Severity
          <select name="severity" defaultValue="minor"><option>info</option><option>minor</option><option>major</option></select>
        </label>
        <label>Title<input name="title" required minLength={3} maxLength={120} /></label>
        <label>Text<textarea name="body" required maxLength={1000} rows={4} /></label>
        <label>Starts (EST, UTC−5) <span className="hint">blank = now</span><input type="datetime-local" name="startsAt" /></label>
        <label>Ends (EST, UTC−5) <span className="hint">required for maintenance</span><input type="datetime-local" name="endsAt" /></label>
        <label>Audience
          <select name="audience" defaultValue="all"><option value="all">All firms</option><option value="listed">Only the firms selected below</option></select>
        </label>
        <label>Firms <span className="hint">used only for “only the firms selected”; hold Ctrl/⌘ to pick several</span>
          <select name="firmIds" multiple size={Math.min(8, Math.max(3, firms.length))}>
            {firms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>Publish
          <select name="publish" defaultValue="no"><option value="no">Save as draft</option><option value="yes">Publish now (firms see it)</option></select>
        </label>
        <div><button type="submit">Post notice</button></div>
      </form>

      <h2>Resolved ({closed.length})</h2>
      <table>
        <thead><tr><th>Notice</th><th>Window</th><th>Resolved</th><th>Note</th></tr></thead>
        <tbody>
          {closed.map((n) => (
            <tr key={n.id}>
              <td><span className="pill">{n.kind}</span> {n.title}</td>
              <td>{when(n.startsAt)} → {when(n.endsAt)}</td>
              <td>{when(n.resolvedAt)}</td>
              <td>{n.resolutionNote ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
