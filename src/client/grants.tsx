"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiFailure, api } from "./api";
import { useAdmin } from "./app";
import { FirmPicker, type PickedFirm } from "./firm-picker";
import { refreshAll, useApi } from "./hooks";
import { splitIssues } from "./session-rules";
import type { GrantRow } from "./types";
import { Alert, Drawer, ErrorAlert, Field, TextArea } from "@/components/ui";

export const SCOPES = ["firm_settings", "matter_documents", "matter_records", "matter_all"] as const;

/** Minutes left for an active grant, recomputed from `ends_at` each minute (CountdownText, spec 1.11). */
export function minutesLeft(g: Pick<GrantRow, "ends_at" | "minutes_left" | "effective_status">, now: number): number | null {
  if (g.effective_status !== "approved" && g.effective_status !== "active") return null;
  if (g.ends_at) return Math.max(0, Math.ceil((Date.parse(g.ends_at) - now * 1000) / 60000));
  return g.minutes_left;
}

export function Countdown({ grant }: { grant: GrantRow }) {
  const { now } = useAdmin();
  const left = minutesLeft(grant, now);
  if (left === null) return <>—</>;
  return <span className="countdown">{left} min left</span>;
}

const FIELDS = ["organizationId", "scope", "matterId", "requestedByName", "requestedByEmail", "ticketRef", "notIncluded", "reason", "minutes", "confirmFirmNotified"];

/** Request access form (spec 2.12). Opens prefilled from `/grants?request=<orgId>`. */
export function RequestAccessDrawer({ firmId, onClose }: { firmId: string | null; onClose: () => void }) {
  const router = useRouter();
  const { me, toast, withAuth, online } = useAdmin();
  const prefill = useApi<{ firm: PickedFirm }>(firmId ? `/firms/${firmId}` : null);
  const [picked, setFirm] = useState<PickedFirm[] | null>(null);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("firm_settings");
  const [matterId, setMatterId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(me.email ?? "");
  const [ticket, setTicket] = useState("");
  const [notIncluded, setNotIncluded] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [notified, setNotified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = Boolean(reason || ticket || notIncluded || matterId || name);

  const prefillFirm = prefill.data?.firm;
  const firm = picked ?? (prefillFirm ? [{ id: prefillFirm.id, display_name: prefillFirm.display_name }] : []);

  const matterScope = scope !== "firm_settings";
  const mins = Number(minutes);
  const valid = firm.length === 1 && name.trim().length >= 1 && reason.trim().length >= 8 && reason.length <= 1000
    && Number.isInteger(mins) && mins >= 15 && mins <= 240 && (!matterScope || matterId.trim()) && notified;
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, FIELDS) : null;
  const err = (k: string) => issues?.byField[k] ?? null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await withAuth(() => api.post<{ id: string; status: string }>("/support/requests", {
        organizationId: firm[0]?.id,
        scope,
        matterId: matterScope ? matterId.trim() : null,
        requestedByName: name.trim(),
        requestedByEmail: email.trim() || null,
        ticketRef: ticket.trim() || null,
        notIncluded: notIncluded.trim() || null,
        reason: reason.trim(),
        minutes: mins,
        confirmFirmNotified: true,
      }));
      refreshAll();
      toast("Request sent. The firm's owners were emailed.");
      router.push(`/grants/${out.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open title="Request access" onClose={onClose} dirty={dirty} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="grant-form" className="btn primary" disabled={!valid || busy || !online}>{busy ? "Sending…" : "Send request"}</button>
      </>
    }>
      <form id="grant-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p className="muted" style={{ margin: 0 }}>The firm&apos;s owners decide. Nothing opens until one of them approves.</p>
        <FirmPicker id="g-firm" label="Firm" value={firm} onChange={setFirm} error={err("organizationId")} />
        <fieldset className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Scope</legend>
          <div className="radios">
            {SCOPES.map((s) => (
              <label key={s}><input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} /><span className="mono">{s}</span></label>
            ))}
          </div>
          {err("scope") ? <span className="err">{err("scope")}</span> : null}
        </fieldset>
        <Field id="g-matter" label="Matter id" hint={matterScope ? "Required for matter scopes. It must be a matter in this firm." : "Not used for firm settings."} error={err("matterId")}>
          <input id="g-matter" className="inp" value={matterId} disabled={!matterScope} onChange={(e) => setMatterId(e.target.value)} />
        </Field>
        <div className="row2">
          <Field id="g-name" label="Requester name" error={err("requestedByName")}>
            <input id="g-name" className="inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field id="g-email" label="Requester email (optional)" error={err("requestedByEmail")}>
            <input id="g-email" className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="row2">
          <Field id="g-ticket" label="Ticket reference" hint="Up to 60 characters." error={err("ticketRef")}>
            <input id="g-ticket" className="inp" maxLength={60} value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </Field>
          <Field id="g-min" label="Minutes" hint="15 to 240. Owners may extend." error={err("minutes")}>
            <input id="g-min" className="inp" type="number" min={15} max={240} step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <TextArea id="g-not" label="Not included (optional)" hint="What you will not look at." max={500} value={notIncluded} onChange={setNotIncluded} error={err("notIncluded")} rows={2} />
        <TextArea id="g-reason" label="Reason" hint="8 to 1000 characters. The firm's owners read this." max={1000} value={reason} onChange={setReason} error={err("reason")} />
        <label className="check"><input type="checkbox" checked={notified} onChange={(e) => setNotified(e.target.checked)} />The firm&apos;s owners will be emailed and must approve</label>
        {issues?.summary.length ? <div className="summary" role="alert"><b>Check the form</b>{issues.summary.join(" ")}</div> : null}
        {error && !issues ? (error instanceof ApiFailure && ["conflict", "forbidden"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
      </form>
    </Drawer>
  );
}
