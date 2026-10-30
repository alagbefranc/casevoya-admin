"use client";
import { useState } from "react";
import { History, Mail, UserPlus, Users } from "lucide-react";
import { ApiFailure, api } from "@/client/api";
import { useAdmin } from "@/client/app";
import { ConfirmDialog } from "@/client/confirm";
import { ConfigTabs } from "@/client/config-tabs";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { dash, day, when } from "@/client/format";
import { splitIssues, stepUpNeed } from "@/client/session-rules";
import type { Role } from "@/client/types";
import { ErrorSummary, Alert, Badge, CodeInput, DataTable, DeniedState, Drawer, Empty, ErrorAlert, Field, NotBuilt, PageHeader, Panel, Section, SkeletonRows, Status, TextArea } from "@/components/ui";

type AdminRow = { user_id: string; email: string; role: Role; template_reviewer: boolean; note: string | null; created_at: string; created_by_email: string | null; last_sign_in_at: string | null; verified_factors: number; licensed: boolean };
type InviteRow = { id: string; email: string; role: Role; template_reviewer: boolean; note: string | null; status: string; invited_by_email: string | null; invited_at: string; expires_at: string; accepted_at: string | null; cancelled_at: string | null };
type Removal = { id: string; user_id: string; email: string; role: Role; removed_at: string; removed_by_email: string | null; reason: string | null };
type Admins = { admins: AdminRow[]; invites: InviteRow[]; removals: Removal[] };
const ROLES: Role[] = ["owner", "operator", "viewer"];
const article = (r: Role) => (r === "owner" || r === "operator" ? "an" : "a");

type Pending =
  | { kind: "role"; admin: AdminRow; role: Role }
  | { kind: "remove"; admin: AdminRow }
  | { kind: "cancel"; invite: InviteRow };

export default function AdminsPage() {
  const { me, withAuth, toast, reloadMe, online } = useAdmin();
  const [q, setQ] = useQueryState();
  const allowed = me.capabilities.manageAdmins;
  const admins = useApi<Admins>(allowed ? "/admins" : null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);
  const inviting = q.get("invite") === "1";

  const owners = admins.data?.admins.filter((a) => a.role === "owner").length ?? 0;
  const afterChange = async () => {
    refreshAll();
    await reloadMe();
  };
  const setReviewer = async (a: AdminRow, on: boolean) => {
    setRowError(null);
    try {
      await withAuth(() => api.patch(`/admins/${a.user_id}/reviewer`, { templateReviewer: on }));
      toast(on ? `${a.email} can review templates` : `${a.email} no longer reviews templates`);
      await afterChange();
    } catch (e) {
      setRowError(e);
    }
  };

  return (
    <>
      <PageHeader title="Config" lede="Product settings and who can administer the platform." />
      <ConfigTabs current="admins" />
      {!allowed ? <DeniedState role={me.role} /> : (
        <Section loaded={admins} skeleton={<SkeletonRows n={5} />}>
          {(d) => (
            <>
              {rowError ? <div style={{ marginBottom: 12 }}>{rowError instanceof ApiFailure && ["conflict", "forbidden"].includes(rowError.code) ? <Alert tone="bad" title={rowError.message} /> : <ErrorAlert error={rowError} />}</div> : null}
              <Panel title="Admins" icon={<Users className="ic" aria-hidden />} right={`${d.admins.length} admins · every change asks for your code`}>
                <DataTable caption="Platform admins" rows={d.admins} rowKey={(a) => a.user_id} columns={[
                  { key: "email", label: "Email", first: true, render: (a) => <><b>{a.email}</b>{a.user_id === me.userId ? <span className="muted"> (you)</span> : null}{a.note ? <small>{a.note}</small> : null}</> },
                  { key: "role", label: "Role", render: (a) => (a.role === "owner" && owners <= 1
                    ? <><Badge tone="info">owner</Badge><small>Last owner</small></>
                    : (
                      <select className="sel sm" aria-label={`Role for ${a.email}`} value={a.role} disabled={!online} onChange={(e) => setPending({ kind: "role", admin: a, role: e.target.value as Role })}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )) },
                  { key: "rev", label: "Template reviewer", render: (a) => <input type="checkbox" role="switch" className="toggle" aria-label={`Template reviewer: ${a.email}`} checked={a.template_reviewer} disabled={!online} onChange={(e) => void setReviewer(a, e.target.checked)} /> },
                  { key: "lic", label: "Licensed", render: (a) => (a.licensed ? <Badge tone="ok">Licensed</Badge> : dash) },
                  { key: "mfa", label: "Factors", render: (a) => (a.verified_factors ? `${a.verified_factors} authenticator${a.verified_factors === 1 ? "" : "s"}` : <Badge tone="warn">None</Badge>) },
                  { key: "seen", label: "Last sign-in", render: (a) => when(a.last_sign_in_at) },
                  { key: "added", label: "Added by / at", render: (a) => <>{a.created_by_email ?? "script"}<small>{day(a.created_at)}</small></> },
                  { key: "act", label: <span className="sr-only">Remove</span>, mobileLabel: "", render: (a) => (a.role === "owner" && owners <= 1
                    ? <small className="muted">Can&apos;t remove the last owner</small>
                    : <button type="button" className="btn sm" disabled={!online} onClick={() => setPending({ kind: "remove", admin: a })}>Remove</button>) },
                ]} />
              </Panel>
              <Panel title="Invites" icon={<Mail className="ic" aria-hidden />} right={<button type="button" className="btn primary sm" disabled={!online} onClick={() => setQ({ invite: "1" })}><UserPlus className="ic" aria-hidden /> Invite an admin</button>}>
                <DataTable caption="Invites" rows={d.invites} rowKey={(i) => i.id} empty={<Empty title="No invites yet." />} columns={[
                  { key: "email", label: "Email", first: true, render: (i) => <><b>{i.email}</b>{i.note ? <small>{i.note}</small> : null}</> },
                  { key: "role", label: "Role", render: (i) => i.role },
                  { key: "rev", label: "Reviewer", render: (i) => (i.template_reviewer ? "Yes" : "No") },
                  { key: "status", label: "Status", render: (i) => <Status value={i.status} /> },
                  { key: "by", label: "Invited by / at", render: (i) => <>{i.invited_by_email ?? dash}<small>{day(i.invited_at)}</small></> },
                  { key: "exp", label: "Expires", render: (i) => (i.status === "pending" ? day(i.expires_at) : dash) },
                  { key: "act", label: <span className="sr-only">Cancel</span>, mobileLabel: "", render: (i) => (i.status === "pending" ? <button type="button" className="btn sm" disabled={!online} onClick={() => setPending({ kind: "cancel", invite: i })}>Cancel</button> : null) },
                ]} />
              </Panel>
              <Panel title="Removed" icon={<History className="ic" aria-hidden />}>
                <DataTable caption="Removed admins" rows={d.removals} rowKey={(r) => r.id} empty={<Empty title="No one has been removed." />} columns={[
                  { key: "email", label: "Email", first: true, render: (r) => <b>{r.email}</b> },
                  { key: "role", label: "Role", render: (r) => r.role },
                  { key: "at", label: "Removed", render: (r) => <>{when(r.removed_at)}<small>{r.removed_by_email ? `by ${r.removed_by_email}` : null}</small></> },
                  { key: "why", label: "Reason", render: (r) => r.reason ?? dash },
                ]} />
              </Panel>
              <p className="foot">Inviting sends no email <NotBuilt />. Removing an admin does not remove them from Cloudflare Access; do that in Cloudflare.</p>
            </>
          )}
        </Section>
      )}
      {pending?.kind === "role" ? (
        <ConfirmDialog title={`Make ${pending.admin.email} ${article(pending.role)} ${pending.role}?`} confirmLabel="Change role" stepUp
          onConfirm={async ({ code }) => { await api.patch(`/admins/${pending.admin.user_id}/role`, { role: pending.role, code }); await reloadMe(); }}
          onClose={() => setPending(null)} successToast="Role changed">
          <p style={{ margin: 0 }}>{pending.role === "viewer" ? "Viewers can read everything but cannot act." : pending.role === "operator" ? "Operators handle support, notices, retries, licence checks and template drafts." : "Owners can also change settings and manage admins."}</p>
        </ConfirmDialog>
      ) : null}
      {pending?.kind === "remove" ? (
        <ConfirmDialog title={`Remove ${pending.admin.email}?`} confirmLabel="Remove admin" danger stepUp
          reason={{ min: 3, max: 500 }} typed={{ label: <>Type <b>{pending.admin.email}</b> to confirm</>, value: pending.admin.email }}
          onConfirm={async ({ reason, typed, code }) => { await api.post(`/admins/${pending.admin.user_id}/remove`, { reason, confirmEmail: typed, code }); await reloadMe(); }}
          onClose={() => setPending(null)} successToast="Admin removed">
          <Alert tone="warn">They lose portal access at once. A removal record is kept. Remove them from the Cloudflare Access policy too.</Alert>
        </ConfirmDialog>
      ) : null}
      {pending?.kind === "cancel" ? (
        <ConfirmDialog title={`Cancel the invite for ${pending.invite.email}?`} confirmLabel="Cancel invite" stepUp reason={{ label: "Reason (optional)", min: 0, max: 500, hint: "Up to 500 characters." }}
          onConfirm={({ reason, code }) => api.post(`/admins/invites/${pending.invite.id}/cancel`, { reason: reason || null, code })}
          onClose={() => setPending(null)} successToast="Invite cancelled" />
      ) : null}
      {inviting && allowed ? <InviteDrawer onClose={() => setQ({ invite: null })} /> : null}
    </>
  );
}

type InviteOut = { id: string; accessReady: boolean; nextSteps: string[] };

function InviteDrawer({ onClose }: { onClose: () => void }) {
  const { me, now, withAuth, online } = useAdmin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [reviewer, setReviewer] = useState(false);
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<InviteOut | null>(null);
  const inlineCode = stepUpNeed(me.session, now) === "code";
  const d = Number(days);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && Number.isInteger(d) && d >= 1 && d <= 30 && note.length <= 200 && (!inlineCode || code.length === 6);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, ["email", "role", "templateReviewer", "note", "days", "code"]) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await withAuth((retry) => api.post<InviteOut>("/admins/invites", { email: email.trim(), role, templateReviewer: reviewer, note: note.trim() || null, days: d, code: inlineCode && !retry && code ? code : undefined }));
      refreshAll();
      setDone(out);
    } catch (e) {
      setError(e);
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Drawer open title="Invite created" onClose={onClose} footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
        <div className="form">
          <p style={{ margin: 0 }}>No email is sent. Tell {email.trim()} yourself, then:</p>
          <ol className="steps">{done.nextSteps.map((s) => <li key={s}>{s}</li>)}</ol>
          {done.accessReady ? <Alert tone="ok">This email is already on the portal&apos;s allow list.</Alert> : <Alert tone="warn" title="Not on the allow list yet">This email is not on the portal&apos;s allow list yet.</Alert>}
          <dl className="dl"><div><dt>Role</dt><dd>{role}{reviewer ? " · template reviewer" : ""}</dd></div><div><dt>Expires</dt><dd>{when(new Date((now + d * 86400) * 1000).toISOString())}</dd></div></dl>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer open title="Invite an admin" onClose={onClose} dirty={Boolean(email || note)} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="invite-form" className="btn primary" disabled={!valid || busy || !online}>{busy ? "Inviting…" : "Create invite"}</button>
      </>
    }>
      <form id="invite-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <ErrorSummary issues={issues} ids={{ email: "i-email", note: "i-note", days: "i-days", code: "i-code" }} />
        <Field id="i-email" label="Email" error={issues?.byField.email ?? null}>
          <input id="i-email" className="inp" type="email" autoComplete="off" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Role</legend>
          <div className="radios">{ROLES.map((r) => <label key={r}><input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />{r}</label>)}</div>
        </fieldset>
        <label className="check"><input type="checkbox" checked={reviewer} onChange={(e) => setReviewer(e.target.checked)} />Template reviewer (also needs a verified licence to review)</label>
        <TextArea id="i-note" label="Note (optional)" max={200} value={note} onChange={setNote} error={issues?.byField.note ?? null} rows={2} />
        <Field id="i-days" label="Expires after (days)" hint="1 to 30." error={issues?.byField.days ?? null}>
          <input id="i-days" className="inp" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Alert tone="info">No email is sent. You tell them, add them to Cloudflare Access and ADMIN_ALLOWED_EMAILS, and they accept after signing in with an authenticator app.</Alert>
        {inlineCode ? <div className="codebox-wrap"><p>Your last authenticator check is older than 15 minutes.</p><CodeInput id="i-code" value={code} onChange={setCode} error={issues?.byField.code ?? null} /></div> : null}
        {error && !issues ? (error instanceof ApiFailure && ["conflict", "forbidden"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
      </form>
    </Drawer>
  );
}
