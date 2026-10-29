import Link from "next/link";
import { connection } from "next/server";
import { ReviewerPanel } from "@/components/reviewer-panel";
import { Denied, Flash, Shell } from "@/components/shell";
import { reviewerLicence, templateOverview, type TemplateVersionRow } from "@/lib/data";
import { flashParams, when } from "@/lib/format";
import { gate } from "@/lib/guard";
import { peekReviewerSession } from "@/lib/reviewer";
import { createDraft } from "./actions";

function Row({ v }: { v: TemplateVersionRow }) {
  return (
    <tr>
      <td><Link href={`/templates/${v.id}`}>{v.templateTitle}</Link><div className="hint mono">{v.stableKey}</div></td>
      <td>v{v.versionNumber}</td>
      <td><span className={`pill ${v.status === "published" ? "ok" : v.status === "draft" ? "warn" : v.status === "rejected" ? "bad" : ""}`}>{v.status}</span></td>
      <td>{v.authorName}</td>
      <td>{v.effectiveOn}</td>
      <td>{v.reviewerLabel ?? "—"}</td>
      <td>{when(v.publishedAt ?? v.reviewedAt ?? v.createdAt)}</td>
    </tr>
  );
}

function Table({ rows, empty }: { rows: TemplateVersionRow[]; empty: string }) {
  if (!rows.length) return <p className="hint">{empty}</p>;
  return (
    <table>
      <thead><tr><th>Template</th><th>Version</th><th>Status</th><th>Author</th><th>Effective</th><th>Reviewer</th><th>When</th></tr></thead>
      <tbody>{rows.map((v) => <Row key={v.id} v={v} />)}</tbody>
    </table>
  );
}

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const admin = result.admin;
  const [overview, licence, session] = await Promise.all([templateOverview(admin), reviewerLicence(admin, admin.userId), peekReviewerSession(admin)]);
  const flash = flashParams(await searchParams);
  return (
    <Shell email={admin.email}>
      <h1>Shared templates</h1>
      <p className="lede">
        Central templates Casevoya publishes to every firm (ADM-03). A platform admin drafts a version with its official
        sources; the licensed reviewer compares it with the current version and approves (publishes) or rejects it with a
        reason. Firms adopt a published version and can still edit their own copy. Every step is audited.
      </p>
      <Flash {...flash} />
      <ReviewerPanel
        flagged={admin.templateReviewer}
        hasKey={Boolean(admin.env.supabasePublishableKey)}
        licenceLabel={licence?.label ?? null}
        session={session}
        userId={admin.userId}
        email={admin.email}
      />

      <h2>Review queue ({overview.drafts.length})</h2>
      <Table rows={overview.drafts} empty="No drafts are waiting for review." />

      <h2>Published ({overview.published.length} of {overview.templateCount} templates)</h2>
      <Table rows={overview.published} empty="Nothing is published yet." />

      <h2>Recent decisions</h2>
      <Table rows={overview.recent} empty="No rejected, superseded or rolled-back versions yet." />

      <h2>New draft</h2>
      <p className="hint">
        You become the author, so you can never approve this version. Using an existing key starts the next version of that
        template (only one open draft per template). Sources must be on the official-source allow list.
      </p>
      <form action={createDraft} className="stack">
        <label>Template key <span className="hint">lowercase_words, e.g. study_permit_checklist</span><input name="stableKey" required pattern="[a-z][a-z0-9_]{1,60}" /></label>
        <label>Title<input name="title" required maxLength={160} /></label>
        <label>Summary<textarea name="summary" maxLength={2000} rows={3} /></label>
        <label>Items <span className="hint">one per line, up to 80, each up to 200 characters</span><textarea name="items" required rows={8} /></label>
        <label>Official sources <span className="hint">one https:// URL per line (canada.ca, justice.gc.ca, a province …)</span><textarea name="sources" required rows={3} /></label>
        <label>Test evidence <span className="hint">what you checked and how</span><textarea name="evidence" required rows={3} /></label>
        <label>Changelog<textarea name="changelog" required maxLength={2000} rows={2} /></label>
        <label>Effective on<input type="date" name="effectiveOn" required /></label>
        <label>Author name<input name="authorName" required maxLength={120} /></label>
        <div><button type="submit">Save draft</button></div>
      </form>
    </Shell>
  );
}
