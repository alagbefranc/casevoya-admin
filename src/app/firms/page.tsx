import { connection } from "next/server";
import { Denied, Shell } from "@/components/shell";
import { listFirms } from "@/lib/data";
import { when } from "@/lib/format";
import { gate } from "@/lib/guard";

export default async function FirmsPage() {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  const firms = await listFirms(result.admin);
  const bySub = firms.reduce<Record<string, number>>((acc, f) => ((acc[f.subscription ?? "none"] = (acc[f.subscription ?? "none"] ?? 0) + 1), acc), {});
  return (
    <Shell email={result.admin.email}>
      <h1>Firms</h1>
      <p className="lede">Read-only firm metadata. No client content, matters or documents are read here.</p>
      <div className="cards">
        <div className="card"><div className="n">{firms.length}</div><div className="l">firms</div></div>
        {Object.entries(bySub).map(([status, n]) => (
          <div className="card" key={status}><div className="n">{n}</div><div className="l">subscription: {status}</div></div>
        ))}
      </div>
      <table>
        <thead>
          <tr><th>Firm</th><th>Slug</th><th>Verification</th><th>Subscription</th><th>Trial ends</th><th>Active seats</th><th>Created</th><th>Id</th></tr>
        </thead>
        <tbody>
          {firms.map((f) => (
            <tr key={f.id}>
              <td>{f.name}{f.legalName && f.legalName !== f.name ? <div className="hint">{f.legalName}</div> : null}{f.sample ? <span className="pill warn">sample</span> : null}</td>
              <td className="mono">{f.slug}</td>
              <td><span className={`pill ${f.verification === "verified" ? "ok" : ""}`}>{f.verification}</span></td>
              <td>{f.subscription ?? "—"}{f.plan ? <div className="hint">{f.plan}</div> : null}</td>
              <td>{when(f.trialEndsAt)}</td>
              <td>{f.activeSeats}</td>
              <td>{when(f.createdAt)}</td>
              <td className="mono">{f.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
