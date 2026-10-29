import { connection } from "next/server";
import { Denied, Shell } from "@/components/shell";
import { deadLetters, firmNames, oldestPending, outboxCounts, OUTBOX_STATUSES } from "@/lib/data";
import { when } from "@/lib/format";
import { gate } from "@/lib/guard";

export default async function HealthPage() {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const [counts, dead, names, oldest] = await Promise.all([
    outboxCounts(result.admin),
    deadLetters(result.admin),
    firmNames(result.admin),
    oldestPending(result.admin),
  ]);
  return (
    <Shell email={result.admin.email}>
      <h1>Service health</h1>
      <p className="lede">
        Delivery outbox (emails, notifications and other background events). View only: retrying a dead-lettered event is not
        available here yet. Event payloads are never shown.
      </p>
      <div className="cards">
        {OUTBOX_STATUSES.map((s) => (
          <div className="card" key={s}>
            <div className="n">{counts[s]}</div>
            <div className="l">{s.replace("_", " ")}</div>
          </div>
        ))}
        <div className="card"><div className="n" style={{ fontSize: 14 }}>{when(oldest)}</div><div className="l">oldest pending</div></div>
      </div>
      <h2>Dead-lettered events ({dead.length})</h2>
      {dead.length === 0 ? (
        <p className="hint">None.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Occurred</th><th>Firm</th><th>Event</th><th>Attempts</th><th>Last error</th><th>Event id</th></tr>
          </thead>
          <tbody>
            {dead.map((d) => (
              <tr key={d.id}>
                <td>{when(d.occurredAt)}</td>
                <td>{names.get(d.organizationId) ?? <span className="mono">{d.organizationId}</span>}</td>
                <td><span className="mono">{d.eventType}</span><div className="hint">{d.aggregateType}</div></td>
                <td>{d.attempts}</td>
                <td className="err">{d.lastError ?? "—"}</td>
                <td className="mono">{d.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
