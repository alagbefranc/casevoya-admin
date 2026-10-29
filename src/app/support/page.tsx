import { connection } from "next/server";
import { Denied, Flash, Shell } from "@/components/shell";
import { firmNames, listSupportRequests } from "@/lib/data";
import { SCOPES } from "@/lib/forms";
import { flashParams, when } from "@/lib/format";
import { gate } from "@/lib/guard";
import { cancelSupportRequest, createSupportRequest } from "./actions";

const OPEN = new Set(["pending", "approved"]);

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const [requests, names] = await Promise.all([listSupportRequests(result.admin), firmNames(result.admin)]);
  const flash = flashParams(await searchParams);
  const firms = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <Shell email={result.admin.email}>
      <h1>Support access</h1>
      <p className="lede">
        Casevoya never opens a firm&apos;s data on its own. A request emails the firm&apos;s owners, who approve or decline it in the app;
        access is time-boxed (15–240 minutes), limited to the scope named, and every read is logged for the firm. Only one request per
        firm can wait at a time.
      </p>
      <Flash {...flash} />

      <h2>Requests and grants ({requests.length})</h2>
      {requests.length === 0 ? <p className="hint">None yet.</p> : (
        <table>
          <thead><tr><th>Requested</th><th>Firm</th><th>Scope</th><th>Status</th><th>Window</th><th>Reads logged</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{when(r.createdAt)}<div className="hint">{r.requestedByName}{r.ticketRef ? ` · ${r.ticketRef}` : ""}</div></td>
                <td>{names.get(r.organizationId) ?? <span className="mono">{r.organizationId}</span>}</td>
                <td><span className="mono">{r.scope}</span>{r.matterId ? <div className="mono hint">{r.matterId}</div> : null}</td>
                <td><span className={`pill ${r.status === "approved" ? "ok" : r.status === "declined" ? "bad" : ""}`}>{r.status}</span>{r.declineReason ? <div className="hint">{r.declineReason}</div> : null}</td>
                <td>{r.startsAt ? `${when(r.startsAt)} → ${when(r.endedAt ?? r.endsAt)}` : `${r.minutes} min requested`}</td>
                <td>{r.uses}</td>
                <td style={{ maxWidth: 260 }}>{r.reason}</td>
                <td>
                  {OPEN.has(r.status) ? (
                    <form action={cancelSupportRequest} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="reason" placeholder="Why (optional)" maxLength={500} />
                      <button type="submit" className="secondary">{r.status === "pending" ? "Cancel" : "End early"}</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Request access</h2>
      <form action={createSupportRequest} className="stack">
        <label>Firm
          <select name="organizationId" required defaultValue="">
            <option value="" disabled>Choose a firm</option>
            {firms.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>Scope
          <select name="scope" defaultValue="firm_settings">{SCOPES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label>Matter id <span className="hint">required for matter scopes; the firm gives it to you</span><input name="matterId" className="mono" /></label>
        <label>Your name as the firm sees it<input name="requesterName" defaultValue="Casevoya support" maxLength={120} /></label>
        <label>Ticket reference <span className="hint">optional</span><input name="ticketRef" maxLength={60} /></label>
        <label>Reason<textarea name="reason" required minLength={8} maxLength={1000} rows={3} /></label>
        <label>Not included <span className="hint">optional, what you will not look at</span><input name="notIncluded" maxLength={500} /></label>
        <label>Minutes<input name="minutes" type="number" min={15} max={240} defaultValue={60} /></label>
        <label className="inline"><input type="checkbox" name="confirm" value="yes" /> I understand this emails the firm&apos;s owners now.</label>
        <div><button type="submit">Send request</button></div>
      </form>
    </Shell>
  );
}
