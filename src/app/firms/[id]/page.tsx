"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Activity, BadgeCheck, Building2, ChartColumn, CreditCard, ExternalLink, KeyRound, Megaphone, MessageSquareWarning, ScrollText, Users } from "lucide-react";
import { CanOperate } from "@/client/app";
import { useApi } from "@/client/hooks";
import { cents, day, num, short, when, words } from "@/client/format";
import { Badge, DataTable, Drawer, Empty, PageHeader, Panel, SampleBadge, Section, Skeleton, SkeletonRows, Status, Timeline, exceptionTone, statusLabel } from "@/components/ui";

type FirmDetail = {
  firm: { id: string; display_name: string; legal_name: string | null; slug: string | null; verification_status: string; sample_mode: boolean; created_at: string; timezone: string | null; default_locale: string | null; jurisdiction_codes: string[] | null; dpa_accepted_at: string | null; dpa_version: string | null; subscription_terms_accepted_at: string | null; subscription_terms_version: string | null };
  subscription: null | { status: string; plan: string | null; billing_interval: string | null; extra_seats: number | null; trial_started_at: string | null; trial_ends_at: string | null; current_period_end: string | null; cancel_at: string | null; cancelled_at: string | null; past_due_since: string | null; restricted_at: string | null; archived_at: string | null; latest_invoice_status: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; exception_reasons: string[] | null; updated_at: string | null };
  subscription_events: { kind: string; occurred_at: string; stripe_event_id: string | null }[] | null;
  invoices: { id: string; status: string; amount_due_cents: number; amount_paid_cents: number; currency: string; created_at: string }[] | null;
  members: { active: number; invited: number; suspended: number; by_role: Record<string, number> } | null;
  credentials: { id: string; licence_type: string; college_id: string; status: string; register_status: string | null; checked_at: string | null; next_review_at: string | null }[] | null;
  support_requests: { id: string; status: string; scope: string; ticket_ref: string | null; created_at: string; ends_at: string | null; open: boolean }[] | null;
  complaints: { open: number; ack_overdue: number; response_overdue: number; total: number } | null;
  outbox: { pending: number; failed: number; dead_lettered: number } | null;
};

export type CredentialDetail = {
  credential: { id: string; organization_id: string; firm_name: string; licence_type: string; college_id: string; status: string; register_status: string | null; entitlement_to_practise: boolean | null; discipline_suspended: boolean | null; discipline_revoked: boolean | null; discipline_restricted: boolean | null; discipline_restriction_detail: string | null; verification_method: string | null; source_url: string | null; declared_at: string | null; checked_at: string | null; next_review_at: string | null; valid_until: string | null };
  checks: { id: string; result: string; retrieved_at: string | null; source_host: string | null; method: string | null; register_status: string | null; reviewer_email: string | null; proof_locator: string | null; created_at: string; cicc_import_id: string | null }[];
  change_reports: { id: string; created_at: string }[];
};
type Why = { firm: { id: string; display_name: string; verification_status: string }; credentials: CredentialDetail[]; rule: string };

export default function FirmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const firm = useApi<FirmDetail>(`/firms/${id}`);
  const [why, setWhy] = useState(false);
  const notFound = (
    <Empty title="This firm does not exist.">
      <p />
      <Link className="btn sm" href="/firms">Back to firms</Link>
    </Empty>
  );
  return (
    <>
      <Section loaded={firm} notFound={notFound} skeleton={<><Skeleton h={40} w={320} /><p /><SkeletonRows n={8} /></>}>
        {(d) => <Detail d={d} onWhy={() => setWhy(true)} />}
      </Section>
      {why && firm.data ? <WhyDrawer id={id} status={firm.data.firm.verification_status} onClose={() => setWhy(false)} /> : null}
    </>
  );
}

function Detail({ d, onWhy }: { d: FirmDetail; onWhy: () => void }) {
  const f = d.firm;
  const s = d.subscription;
  const m = d.members;
  const openRequest = (d.support_requests ?? []).find((r) => r.open);
  return (
    <>
      <PageHeader
        crumb={<><Link href="/firms">Firms</Link> › {f.display_name}</>}
        title={f.display_name}
        badge={<SampleBadge on={f.sample_mode} />}
        lede={<>{[f.legal_name, s?.plan ? `${words(s.plan)} plan` : null, f.slug, `created ${day(f.created_at)}`].filter(Boolean).join(" · ")}<span className="badges" style={{ marginTop: 8 }}><Status value={f.verification_status} />{s ? <Status value={s.status} /> : <Badge>No subscription</Badge>}</span></>}
        actions={<CanOperate><Link className="btn primary" href={`/grants?request=${f.id}`}><KeyRound className="ic" aria-hidden />Ask for support access</Link></CanOperate>}
      />
      <div className="cols">
        <div>
          <Panel title="Account" icon={<Building2 className="ic" aria-hidden />}>
            <dl className="dl pad">
              <div><dt>Legal name</dt><dd>{f.legal_name ?? "—"}</dd></div>
              <div><dt>Firm id</dt><dd className="mono">{f.id}</dd></div>
              <div><dt>Verification</dt><dd><Status value={f.verification_status} /></dd></div>
              <div><dt>Created</dt><dd>{when(f.created_at)}</dd></div>
              <div><dt>Time zone</dt><dd>{f.timezone ?? "—"}</dd></div>
              <div><dt>Locale</dt><dd>{f.default_locale ?? "—"}</dd></div>
              <div><dt>Jurisdictions</dt><dd>{f.jurisdiction_codes?.length ? f.jurisdiction_codes.join(", ") : "—"}</dd></div>
              <div><dt>Sample data</dt><dd>{f.sample_mode ? "Yes" : "No"}</dd></div>
              <div><dt>Data processing agreement</dt><dd>{f.dpa_accepted_at ? `${f.dpa_version ?? "Accepted"} · ${day(f.dpa_accepted_at)}` : "Not accepted"}</dd></div>
              <div><dt>Subscription terms</dt><dd>{f.subscription_terms_accepted_at ? `${f.subscription_terms_version ?? "Accepted"} · ${day(f.subscription_terms_accepted_at)}` : "Not accepted"}</dd></div>
            </dl>
          </Panel>

          <Panel title="Subscription" icon={<CreditCard className="ic" aria-hidden />}>
            {s ? (
              <>
                <dl className="dl pad">
                  <div><dt>Status</dt><dd><Status value={s.status} /></dd></div>
                  <div><dt>Plan · interval</dt><dd>{words(s.plan)} · {s.billing_interval ?? "—"}{s.extra_seats ? ` · ${s.extra_seats} extra seats` : ""}</dd></div>
                  <div><dt>{s.status === "trial" ? "Trial ends" : "Period ends"}</dt><dd>{day(s.status === "trial" ? s.trial_ends_at : s.current_period_end)}</dd></div>
                  <div><dt>Exceptions</dt><dd><span className="badges">{s.exception_reasons?.length ? s.exception_reasons.map((r) => <Badge key={r} tone={exceptionTone(r)}>{statusLabel(r)}</Badge>) : "None"}</span></dd></div>
                  {s.cancel_at ? <div><dt>Cancels</dt><dd>{day(s.cancel_at)}</dd></div> : null}
                  {s.past_due_since ? <div><dt>Past due since</dt><dd>{when(s.past_due_since)}</dd></div> : null}
                  {s.restricted_at ? <div><dt>Restricted</dt><dd>{when(s.restricted_at)}</dd></div> : null}
                  {s.archived_at ? <div><dt>Archived</dt><dd>{when(s.archived_at)}</dd></div> : null}
                  <div><dt>Stripe</dt><dd>{s.stripe_customer_id ? <a href={`https://dashboard.stripe.com/customers/${encodeURIComponent(s.stripe_customer_id)}`} target="_blank" rel="noreferrer noopener">Open in Stripe <ExternalLink className="ic" aria-hidden style={{ verticalAlign: -3 }} /></a> : "—"}</dd></div>
                  <div><dt>Updated</dt><dd>{when(s.updated_at)}</dd></div>
                </dl>
                {d.invoices?.length ? (
                  <DataTable caption="Invoices" rowKey={(i) => i.id} rows={d.invoices} columns={[
                    { key: "id", label: "Invoice", first: true, render: (i) => <span className="mono">{i.id.length > 12 ? `${i.id.slice(0, 10)}…` : i.id}</span> },
                    { key: "amt", label: "Amount", render: (i) => cents(i.amount_due_cents, i.currency) },
                    { key: "paid", label: "Paid", render: (i) => cents(i.amount_paid_cents, i.currency) },
                    { key: "st", label: "Status", render: (i) => <Status value={i.status} /> },
                    { key: "date", label: "Date", render: (i) => day(i.created_at) },
                  ]} />
                ) : <p className="pad muted" style={{ margin: 0 }}>No invoices yet.</p>}
                {d.subscription_events?.length ? (
                  <div className="pad"><h3 style={{ font: "600 13px var(--body)", margin: "0 0 4px" }}>Recent events</h3>
                    <Timeline items={d.subscription_events.map((e, i) => ({ key: `${e.stripe_event_id ?? i}`, at: e.occurred_at, title: words(e.kind.replace(/\./g, " ")), meta: e.stripe_event_id ? <span className="mono">{e.stripe_event_id}</span> : null }))} />
                  </div>
                ) : null}
              </>
            ) : <p className="pad" style={{ margin: 0 }}><Badge>No subscription</Badge> This firm has no subscription row.</p>}
          </Panel>

          <Panel title="Licences" icon={<BadgeCheck className="ic" aria-hidden />} right={<button type="button" className="linkbtn" onClick={onWhy}>Why is this firm {statusLabel(f.verification_status).toLowerCase()}?</button>}>
            {d.credentials?.length ? (
              <DataTable caption="Credentials" rowKey={(c) => c.id} rows={d.credentials} columns={[
                { key: "t", label: "Licence", first: true, render: (c) => <b><Link href={`/verification/credentials/${c.id}`}>{c.licence_type?.toUpperCase()} {c.college_id}</Link></b> },
                { key: "s", label: "Status", render: (c) => <Status value={c.status} /> },
                { key: "r", label: "Register", render: (c) => words(c.register_status) },
                { key: "c", label: "Checked", render: (c) => day(c.checked_at) },
                { key: "n", label: "Next review", render: (c) => day(c.next_review_at) },
              ]} />
            ) : <Empty title="No licences declared yet." />}
          </Panel>
        </div>

        <div>
          <Panel title="People" icon={<Users className="ic" aria-hidden />}>
            <div className="pad">
              <dl className="dl">
                <div><dt>Active</dt><dd>{num(m?.active)}</dd></div>
                <div><dt>Invited</dt><dd>{num(m?.invited)}</dd></div>
                <div><dt>Suspended</dt><dd>{num(m?.suspended)}</dd></div>
                {Object.entries(m?.by_role ?? {}).map(([r, n]) => <div key={r}><dt>{words(r)}</dt><dd>{num(n)}</dd></div>)}
              </dl>
              <p className="foot">Counts only. Names and emails of firm staff are not shown.</p>
            </div>
          </Panel>

          <Panel title="Support" icon={<KeyRound className="ic" aria-hidden />} right={<Link href={`/grants?organizationId=${f.id}`}>All</Link>}>
            {d.support_requests?.length ? (
              <ul className="gl">
                {d.support_requests.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/grants/${r.id}`}>{words(r.scope)}</Link>
                      <span className="sub">{r.ticket_ref ?? "No ticket"} · {day(r.created_at)}</span>
                    </div>
                    <span className="bd"><Status value={r.status} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="pad" style={{ margin: 0 }}>{openRequest ? null : "No support access for this firm."}</p>}
            <CanOperate>
              <div className="pad" style={{ paddingTop: 0 }}><Link className="btn sm" href={`/grants?request=${f.id}`}><KeyRound className="ic" aria-hidden />Ask for support access</Link></div>
            </CanOperate>
          </Panel>

          <Panel title="Health" icon={<Activity className="ic" aria-hidden />} right={<Link href="/health">Health</Link>}>
            <dl className="dl pad">
              <div><dt>Pending events</dt><dd>{num(d.outbox?.pending)}</dd></div>
              <div><dt>Failed</dt><dd>{d.outbox?.failed ? <Badge tone="warn">{num(d.outbox.failed)}</Badge> : "0"}</dd></div>
              <div><dt>Dead-lettered</dt><dd>{d.outbox?.dead_lettered ? <Badge tone="bad">{num(d.outbox.dead_lettered)}</Badge> : "0"}</dd></div>
            </dl>
          </Panel>

          <Panel title="Complaints" icon={<MessageSquareWarning className="ic" aria-hidden />}>
            <dl className="dl pad">
              <div><dt>Open</dt><dd>{num(d.complaints?.open)}</dd></div>
              <div><dt>Total</dt><dd>{num(d.complaints?.total)}</dd></div>
              <div><dt>Acknowledgement overdue</dt><dd>{d.complaints?.ack_overdue ? <Badge tone="bad">{num(d.complaints.ack_overdue)}</Badge> : "0"}</dd></div>
              <div><dt>Response overdue</dt><dd>{d.complaints?.response_overdue ? <Badge tone="bad">{num(d.complaints.response_overdue)}</Badge> : "0"}</dd></div>
            </dl>
          </Panel>

          <Panel title="More for this firm">
            <ul className="gl">
              <li><span className="ki" aria-hidden><ChartColumn className="ic" /></span><Link href={`/usage?search=${encodeURIComponent(f.slug ?? f.display_name)}`}>Usage</Link></li>
              <CanOperate><li><span className="ki" aria-hidden><Megaphone className="ic" /></span><Link href={`/incidents?tab=notices&post=${f.id}`}>Post a notice to this firm</Link></li></CanOperate>
              <li><span className="ki" aria-hidden><ScrollText className="ic" /></span><Link href={`/audit?organizationId=${f.id}`}>Audit log for this firm</Link></li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function WhyDrawer({ id, status, onClose }: { id: string; status: string; onClose: () => void }) {
  const why = useApi<Why>(`/firms/${id}/verification`);
  return (
    <Drawer open title={`Why is this firm ${statusLabel(status).toLowerCase()}?`} onClose={onClose}>
      <Section loaded={why} skeleton={<SkeletonRows n={4} />}>
        {(w) => (
          <>
            <div className="alert info"><div><b>The rule</b>{w.rule}</div></div>
            {w.credentials.length ? w.credentials.map((c) => (
              <div key={c.credential.id} className="card">
                <div className="t"><BadgeCheck className="ic" aria-hidden /><Link href={`/verification/credentials/${c.credential.id}`}>{c.credential.licence_type?.toUpperCase()} {c.credential.college_id}</Link></div>
                <div className="badges"><Status value={c.credential.status} />{c.credential.register_status ? <Badge>Register: {words(c.credential.register_status)}</Badge> : null}</div>
                <div className="s">Checked {when(c.credential.checked_at)} · next review {day(c.credential.next_review_at)}</div>
                {c.checks[0] ? <div className="s">Latest check: {statusLabel(c.checks[0].result)} via {words(c.checks[0].method)} ({short(c.checks[0].id)})</div> : <div className="s">Never checked.</div>}
              </div>
            )) : <Empty title="This firm has no licences." />}
          </>
        )}
      </Section>
    </Drawer>
  );
}
