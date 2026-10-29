import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReviewerPanel } from "@/components/reviewer-panel";
import { Denied, Flash, Shell } from "@/components/shell";
import { officialDomains, reviewerLicence, templateVersionDetail, type TemplateVersionRow } from "@/lib/data";
import { flashParams, when } from "@/lib/format";
import { uuid } from "@/lib/forms";
import { gate } from "@/lib/guard";
import { peekReviewerSession } from "@/lib/reviewer";
import { BLOCKER_TEXT, extractCitations, reviewBlockers, splitEvidence, type Citation } from "@/lib/templates";
import { approveVersion, rejectVersion, reviseDraft } from "../actions";

function Body({ v, label }: { v: TemplateVersionRow | null; label: string }) {
  return (
    <div className="card">
      <div className="l">{label}</div>
      {!v ? (
        <p className="hint">Nothing published yet: this would be the first version.</p>
      ) : (
        <>
          <p><strong>{v.body.title}</strong> <span className="hint">v{v.versionNumber} · effective {v.effectiveOn}</span></p>
          {v.body.summary ? <p style={{ whiteSpace: "pre-wrap" }}>{v.body.summary}</p> : null}
          <ol>{v.body.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
          <p className="hint mono">sha256 {v.contentHash.slice(0, 16)}…</p>
        </>
      )}
    </div>
  );
}

function Citations({ list }: { list: Citation[] }) {
  if (!list.length) return <p className="err">No source URLs are cited. Do not approve until the author adds official sources.</p>;
  return (
    <ul>
      {list.map((c) => (
        <li key={c.url}>
          <a href={c.url} target="_blank" rel="noreferrer noopener">{c.url}</a>{" "}
          {c.official ? <span className="pill ok">official · {c.authority}</span> : <span className="pill bad">not an official source</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function TemplateVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const admin = result.admin;
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [detail, domains, licence, session] = await Promise.all([
    templateVersionDetail(admin, id),
    officialDomains(admin),
    reviewerLicence(admin, admin.userId),
    peekReviewerSession(),
  ]);
  if (!detail) notFound();
  const { version: v, current, reviews, changes } = detail;
  const flash = flashParams(await searchParams);
  const { evidence, sources } = splitEvidence(v.testEvidence);
  const citations = extractCitations([sources.join("\n"), evidence, v.changelog, v.body.summary, ...v.body.items], domains);
  const flagged = admin.env.reviewerEmails.includes(admin.email);
  const blockers = reviewBlockers({
    email: admin.email,
    userId: admin.userId,
    reviewerEmails: admin.env.reviewerEmails,
    hasPublishableKey: Boolean(admin.env.supabasePublishableKey),
    version: v,
    licensed: Boolean(licence),
    sessionUserId: session?.userId ?? null,
  });
  const isAuthor = v.authorUserId === admin.userId;
  return (
    <Shell email={admin.email}>
      <p><Link href="/templates">← Shared templates</Link></p>
      <h1>{v.templateTitle} <span className="hint">v{v.versionNumber}</span></h1>
      <p className="lede">
        <span className={`pill ${v.status === "published" ? "ok" : v.status === "draft" ? "warn" : v.status === "rejected" ? "bad" : ""}`}>{v.status}</span>{" "}
        key <span className="mono">{v.stableKey}</span> · author {v.authorName}{isAuthor ? " (you)" : ""} · drafted {when(v.createdAt)} · effective {v.effectiveOn}
        {v.reviewerLabel ? ` · reviewed by ${v.reviewerLabel} ${when(v.reviewedAt)}` : ""}
      </p>
      <Flash {...flash} />

      <h2>Changes from the current version</h2>
      {changes.length === 0 ? <p className="hint">No text differences.</p> : (
        <table>
          <thead><tr><th>Field</th><th>Current</th><th>This version</th></tr></thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.field}>
                <td>{c.field}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{c.before || <span className="hint">(none)</span>}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{c.after || <span className="hint">(none)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <Body v={current} label="Current published version" />
        <Body v={v} label={v.status === "draft" ? "Draft under review" : "This version"} />
      </div>

      <h2>Official-source citations</h2>
      <Citations list={citations} />
      <h2>Test evidence</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{evidence}</p>
      <h2>Changelog</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{v.changelog}</p>

      {reviews.length ? (
        <>
          <h2>Decisions</h2>
          <ul>{reviews.map((r, i) => <li key={i}>{r.decision} by {r.reviewerLabel} · {when(r.decidedAt)}{r.reason ? ` — ${r.reason}` : ""}</li>)}</ul>
        </>
      ) : null}

      {v.status === "draft" ? (
        <>
          <h2>Review</h2>
          <ReviewerPanel flagged={flagged} hasKey={Boolean(admin.env.supabasePublishableKey)} licenceLabel={licence?.label ?? null} session={session} userId={admin.userId} email={admin.email} next={v.id} />
          {blockers.length ? (
            <ul className="err">{blockers.map((b) => <li key={b}>{BLOCKER_TEXT[b]}</li>)}</ul>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <form action={approveVersion} className="stack card">
                <strong>Approve and publish</strong>
                <input type="hidden" name="id" value={v.id} />
                <label className="inline"><input type="checkbox" name="confirm" value="yes" required /> I compared this draft with the current version and the official sources above.</label>
                <label>Authenticator code (fresh step-up)<input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" /></label>
                <div><button type="submit">Approve and publish to all firms</button></div>
              </form>
              <form action={rejectVersion} className="stack card">
                <strong>Reject</strong>
                <input type="hidden" name="id" value={v.id} />
                <label>Reason (the author sees it)<textarea name="reason" required minLength={3} maxLength={500} rows={3} /></label>
                <label>Authenticator code (fresh step-up)<input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" /></label>
                <div><button type="submit" className="secondary">Reject</button></div>
              </form>
            </div>
          )}

          {isAuthor ? (
            <>
              <h2>Revise this draft</h2>
              <form action={reviseDraft} className="stack">
                <input type="hidden" name="id" value={v.id} />
                <label>Title<input name="title" required maxLength={160} defaultValue={v.body.title} /></label>
                <label>Summary<textarea name="summary" maxLength={2000} rows={3} defaultValue={v.body.summary} /></label>
                <label>Items <span className="hint">one per line</span><textarea name="items" required rows={8} defaultValue={v.body.items.join("\n")} /></label>
                <label>Official sources <span className="hint">one https:// URL per line</span><textarea name="sources" required rows={3} defaultValue={sources.join("\n")} /></label>
                <label>Test evidence<textarea name="evidence" required rows={3} defaultValue={evidence} /></label>
                <label>Changelog<textarea name="changelog" required maxLength={2000} rows={2} defaultValue={v.changelog} /></label>
                <label>Effective on<input type="date" name="effectiveOn" required defaultValue={v.effectiveOn} /></label>
                <div><button type="submit">Save revision</button></div>
              </form>
            </>
          ) : null}
        </>
      ) : null}
    </Shell>
  );
}
