"use client";
import { useState } from "react";
import { Settings2, ToggleLeft } from "lucide-react";
import { ApiFailure, api } from "@/client/api";
import { useAdmin } from "@/client/app";
import { ConfigTabs } from "@/client/config-tabs";
import { formatSetting, type SettingValue } from "@/client/settings";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { day } from "@/client/format";
import { splitIssues, stepUpNeed } from "@/client/session-rules";
import { Alert, Badge, CodeInput, DataTable, Drawer, ErrorAlert, Field, NotBuilt, PageHeader, Panel, Section, SkeletonRows, StubPanel, TextArea } from "@/components/ui";

type Setting = { key: string; value: SettingValue; description: string | null; pending_confirmation: boolean; created_at: string; updated_at: string | null; version: number; editable: boolean; allowed_units: string[] };
type Switch = { key: string; enabled: boolean; description: string | null; editable: false };
type Config = { settings: Setting[]; switches: Switch[]; featureFlags: { items: unknown[]; stub: true; gap: string } };

export default function ConfigPage() {
  const [q, setQ] = useQueryState();
  const tab = (["switches", "flags"] as const).find((t) => t === q.get("tab")) ?? "settings";
  const config = useApi<Config>("/config");
  const { me } = useAdmin();
  const editing = q.get("edit");

  return (
    <>
      <PageHeader title="Config" lede="Product settings and who can administer the platform." />
      <ConfigTabs current={tab} />
      <Section loaded={config} skeleton={<SkeletonRows n={5} />}>
        {(c) => {
          if (tab === "flags") return <StubPanel title="Feature flags" gap={c.featureFlags.gap} />;
          if (tab === "switches") {
            return (
              <Panel title="Switches" icon={<ToggleLeft className="ic" aria-hidden />}>
                <DataTable caption="Switches" rows={c.switches} rowKey={(s) => s.key} columns={[
                  { key: "key", label: "Key", first: true, render: (s) => <span className="mono">{s.key}</span> },
                  { key: "desc", label: "Description", render: (s) => s.description ?? "—" },
                  { key: "on", label: "State", render: (s) => <Badge tone={s.enabled ? "ok" : "neutral"}>{s.enabled ? "On" : "Off"}</Badge> },
                ]} />
                <p className="foot" style={{ padding: "0 16px 14px" }}>Switches cannot be changed from the portal yet. <NotBuilt /></p>
              </Panel>
            );
          }
          const target = editing ? c.settings.find((s) => s.key === editing && s.editable) : undefined;
          return (
            <>
              <Panel title="Settings" icon={<Settings2 className="ic" aria-hidden />}>
                <DataTable caption="Settings" rows={c.settings} rowKey={(s) => s.key} columns={[
                  { key: "key", label: "Key", first: true, render: (s) => <span className="mono">{s.key}</span> },
                  { key: "desc", label: "Description", render: (s) => s.description ?? "—" },
                  { key: "value", label: "Value", render: (s) => <span className="badges"><span className={s.editable ? undefined : "mono"}>{formatSetting(s.value)}</span>{s.pending_confirmation ? <Badge tone="warn">Unconfirmed</Badge> : null}</span> },
                  { key: "updated", label: "Updated", render: (s) => day(s.updated_at) },
                  { key: "version", label: "Version", render: (s) => s.version },
                  { key: "act", label: <span className="sr-only">Change</span>, mobileLabel: "", render: (s) => (s.editable && me.capabilities.manageAdmins ? <button type="button" className="btn sm" onClick={() => setQ({ edit: s.key })}>Change</button> : null) },
                ]} />
              </Panel>
              <p className="foot">Only duration settings ({"{unit, count}"}) can be changed here, by owners. Everything else changes through reviewed migrations. <NotBuilt /></p>
              {target && me.capabilities.manageAdmins ? <ChangeSetting setting={target} onClose={() => setQ({ edit: null })} /> : null}
            </>
          );
        }}
      </Section>
    </>
  );
}

function ChangeSetting({ setting, onClose }: { setting: Setting; onClose: () => void }) {
  const { me, now, withAuth, toast, online } = useAdmin();
  const current = setting.value as { unit: string; count: number };
  const [count, setCount] = useState(String(current.count));
  const [unit, setUnit] = useState(setting.allowed_units.includes(current.unit) ? current.unit : setting.allowed_units[0]);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inlineCode = stepUpNeed(me.session, now) === "code";
  const n = Number(count);
  const countOk = Number.isInteger(n) && n >= 1 && n <= 3650;
  const changed = n !== current.count || unit !== current.unit;
  const valid = countOk && changed && reason.trim().length >= 3 && reason.length <= 500 && (!inlineCode || code.length === 6);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, ["value.count", "value.unit", "reason", "code"]) : null;
  const label = setting.description ?? setting.key;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await withAuth((retry) => api.patch(`/config/settings/${encodeURIComponent(setting.key)}`, { value: { unit, count: n }, reason: reason.trim(), code: inlineCode && !retry && code ? code : undefined }));
      refreshAll();
      toast("Setting saved");
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Drawer open title={<>Change <span className="mono">{setting.key}</span></>} onClose={onClose} dirty={changed || Boolean(reason)} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="setting-form" className="btn primary" disabled={!valid || busy || !online}>{busy ? "Saving…" : "Save setting"}</button>
      </>
    }>
      <form id="setting-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <dl className="dl">
          <div><dt>Current value</dt><dd>{formatSetting(setting.value)}</dd></div>
          <div><dt>Version</dt><dd>{setting.version}</dd></div>
        </dl>
        <div className="row2">
          <Field id="s-count" label="Count" hint="1 to 3650." error={issues?.byField["value.count"] ?? (count && !countOk ? "Enter a whole number from 1 to 3650" : null)}>
            <input id="s-count" className="inp" type="number" min={1} max={3650} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field id="s-unit" label="Unit" error={issues?.byField["value.unit"] ?? null}>
            <select id="s-unit" className="sel" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {setting.allowed_units.map((u) => <option key={u} value={u}>{u.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>
        {countOk && changed ? <Alert tone="info" title="Preview">{label}: {formatSetting(setting.value)} → {formatSetting({ unit, count: n })}. Applies at once to new work.</Alert> : null}
        <TextArea id="s-reason" label="Reason" hint="3 to 500 characters. Saved in the audit log." max={500} value={reason} onChange={setReason} error={issues?.byField.reason ?? null} />
        {inlineCode ? <div className="codebox-wrap"><p>Your last authenticator check is older than 15 minutes.</p><CodeInput id="s-code" value={code} onChange={setCode} error={issues?.byField.code ?? null} /></div> : null}
        {issues?.summary.length ? <div className="summary" role="alert"><b>Check the form</b>{issues.summary.join(" ")}</div> : null}
        {error && !issues ? (error instanceof ApiFailure && ["conflict", "not_found", "forbidden"].includes(error.code) ? <Alert tone="bad" title={error.message} /> : <ErrorAlert error={error} />) : null}
      </form>
    </Drawer>
  );
}
