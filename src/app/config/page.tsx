"use client";
import { useState } from "react";
import { AlertTriangle, FlaskConical, History, RotateCcw, Settings2, ToggleLeft } from "@/components/icons";
import { api } from "@/client/api";
import { useAdmin } from "@/client/app";
import { ConfigTabs } from "@/client/config-tabs";
import { ConfirmDialog } from "@/client/confirm";
import { FirmPicker, type PickedFirm } from "@/client/firm-picker";
import { formatSetting, type SettingValue } from "@/client/settings";
import { refreshAll, useApi, useQueryState } from "@/client/hooks";
import { day, when } from "@/client/format";
import { Alert, Badge, DataTable, Drawer, Empty, ErrorAlert, Field, PageHeader, Panel, Section, Seg, SkeletonRows } from "@/components/ui";
import { checkSettingInput, formatEditable, needsTypedKey, nextStoredValue, sameValue, type Danger, type SettingRule } from "@/lib/config-rules";

type Setting = { key: string; value: SettingValue; description: string | null; pending_confirmation: boolean; updated_at: string | null; version: number; editable: boolean; rule: SettingRule | null; current: unknown };
type Switch = { key: string; enabled: boolean; description: string | null; version: number; updated_at: string | null; editable: boolean; danger: Danger; danger_note: string | null };
type Override = { organization_id: string; firm_name: string | null; enabled: boolean; updated_at: string | null };
type Flag = { key: string; description: string; enabled: boolean; danger: Danger; danger_note: string | null; version: number; updated_at: string | null; overrides: Override[] };
type Change = { id: string; target: "setting" | "flag" | "flag_override"; config_key: string; organization_id: string | null; firm_name: string | null; old_value: unknown; new_value: unknown; reason: string; reverts_change_id: string | null; created_at: string; revertible: boolean };
export type Config = { settings: Setting[]; switches: Switch[]; featureFlags: { items: Flag[] }; changes: Change[] };

/** What the confirm dialog is about to do. */
type Pending =
  | { kind: "setting"; key: string; label: string; before: string; after: string; danger: Danger; dangerNote: string | null; run: (r: { reason: string; code?: string; confirm?: string }) => Promise<unknown> }
  | null;

function DangerBadge({ danger }: { danger: Danger }) {
  if (danger === "critical") return <Badge tone="bad">Dangerous</Badge>;
  if (danger === "caution") return <Badge tone="warn">Caution</Badge>;
  return null;
}

const onOff = (v: unknown) => (v === true ? "On" : v === false ? "Off" : v === null || v === undefined ? "No override" : String(v));

export default function ConfigPage() {
  const [q, setQ] = useQueryState();
  const tab = (["switches", "flags"] as const).find((t) => t === q.get("tab")) ?? "settings";
  const config = useApi<Config>("/config");
  const { me } = useAdmin();
  const owner = me.capabilities.manageAdmins;
  const editing = q.get("edit");
  const [pending, setPending] = useState<Pending>(null);
  const [overridesFor, setOverridesFor] = useState<string | null>(null);

  const lede = owner
    ? "Product settings, on/off switches and feature flags. Owners change them here with a reason and a fresh authenticator check; every change is audited and can be reverted."
    : "Product settings, on/off switches and feature flags. Only platform owners can change them.";

  return (
    <>
      <PageHeader title="Config" lede={lede} />
      <ConfigTabs current={tab} />
      <Section loaded={config} skeleton={<SkeletonRows n={5} />}>
        {(c) => {
          const changes = c.changes.filter((ch) => (tab === "flags" ? ch.target !== "setting" : ch.target === "setting" && (tab === "switches") === c.switches.some((s) => s.key === ch.config_key)));
          return (
            <>
              {tab === "switches" ? <SwitchesTab c={c} owner={owner} onPending={setPending} /> : null}
              {tab === "flags" ? <FlagsTab c={c} owner={owner} onPending={setPending} onOverrides={setOverridesFor} /> : null}
              {tab === "settings" ? <SettingsTab c={c} owner={owner} onEdit={(k) => setQ({ edit: k })} /> : null}
              <ChangesPanel changes={changes} owner={owner} />
              {tab === "settings" && editing && owner ? (() => {
                const s = c.settings.find((x) => x.key === editing && x.editable && x.rule);
                return s ? <EditSetting setting={s} onClose={() => setQ({ edit: null })} onReview={(p) => setPending(p)} /> : null;
              })() : null}
              {tab === "flags" && overridesFor && owner ? (() => {
                const f = c.featureFlags.items.find((x) => x.key === overridesFor);
                return f ? <FlagOverrides flag={f} onClose={() => setOverridesFor(null)} onPending={setPending} /> : null;
              })() : null}
              {pending ? <ConfirmChange pending={pending} onClose={(done) => { setPending(null); if (done) setQ({ edit: null }); }} /> : null}
            </>
          );
        }}
      </Section>
    </>
  );
}

function SettingsTab({ c, owner, onEdit }: { c: Config; owner: boolean; onEdit: (key: string) => void }) {
  const switchKeys = new Set(c.switches.map((s) => s.key));
  const rows = c.settings.filter((s) => !switchKeys.has(s.key));
  return (
    <>
      <Panel title="Settings" icon={<Settings2 className="ic" aria-hidden />}>
        <DataTable caption="Settings" rows={rows} rowKey={(s) => s.key} columns={[
          { key: "key", label: "Key", first: true, render: (s) => <span className="mono">{s.key}</span> },
          { key: "desc", label: "Description", render: (s) => s.description ?? "—" },
          { key: "value", label: "Value", render: (s) => (
            <span className="badges">
              <span className={s.rule ? undefined : "mono"}>{s.rule ? formatEditable(s.rule.kind, s.current) : formatSetting(s.value)}</span>
              {s.pending_confirmation ? <Badge tone="warn">Unconfirmed</Badge> : null}
              {s.rule ? <DangerBadge danger={s.rule.danger} /> : <Badge>Migration only</Badge>}
            </span>
          ) },
          { key: "updated", label: "Updated", render: (s) => day(s.updated_at) },
          { key: "version", label: "Version", render: (s) => s.version },
          { key: "act", label: <span className="sr-only">Change</span>, mobileLabel: "", render: (s) => (s.editable && owner ? <button type="button" className="btn sm" onClick={() => onEdit(s.key)}>Change</button> : null) },
        ]} />
      </Panel>
      <p className="foot">Settings marked Migration only (legal wording, sender address and inbound domain, plans and Stripe prices, multi-part limits and reminder lists) change through a reviewed migration. Changes apply to the app on its next request.</p>
    </>
  );
}

function SwitchesTab({ c, owner, onPending }: { c: Config; owner: boolean; onPending: (p: Pending) => void }) {
  const toggle = (s: Switch) => onPending({
    kind: "setting", key: s.key, label: s.description ?? s.key, before: onOff(s.enabled), after: onOff(!s.enabled), danger: s.danger, dangerNote: s.danger_note,
    run: (r) => api.patch(`/config/settings/${encodeURIComponent(s.key)}`, { value: !s.enabled, expectedVersion: s.version, reason: r.reason, confirm: r.confirm, code: r.code }),
  });
  return (
    <Panel title="Switches" icon={<ToggleLeft className="ic" aria-hidden />}>
      <DataTable caption="Switches" rows={c.switches} rowKey={(s) => s.key} columns={[
        { key: "key", label: "Key", first: true, render: (s) => <span className="mono">{s.key}</span> },
        { key: "desc", label: "Description", render: (s) => s.description ?? "—" },
        { key: "on", label: "State", render: (s) => <span className="badges"><Badge tone={s.enabled ? "ok" : "neutral"}>{s.enabled ? "On" : "Off"}</Badge><DangerBadge danger={s.danger} /></span> },
        { key: "updated", label: "Updated", render: (s) => day(s.updated_at) },
        { key: "act", label: <span className="sr-only">Change</span>, mobileLabel: "", render: (s) => (s.editable && owner ? <button type="button" className={`btn sm${s.danger === "critical" ? " danger" : ""}`} onClick={() => toggle(s)}>{s.enabled ? "Turn off" : "Turn on"}</button> : s.editable ? null : <Badge>Migration only</Badge>) },
      ]} />
      <p className="foot" style={{ padding: "0 16px 14px" }}>Dangerous switches need their key typed to confirm. Revert in Recent changes puts the old value back in one click. There are no payment or sign-up kill switches.</p>
    </Panel>
  );
}

function FlagsTab({ c, owner, onPending, onOverrides }: { c: Config; owner: boolean; onPending: (p: Pending) => void; onOverrides: (key: string) => void }) {
  const toggle = (f: Flag) => onPending({
    kind: "setting", key: f.key, label: `${f.description} (default for every firm without an override)`, before: onOff(f.enabled), after: onOff(!f.enabled), danger: f.danger, dangerNote: f.danger_note,
    run: (r) => api.patch(`/config/flags/${encodeURIComponent(f.key)}`, { enabled: !f.enabled, expectedVersion: f.version, reason: r.reason, confirm: r.confirm, code: r.code }),
  });
  return (
    <Panel title="Feature flags" icon={<FlaskConical className="ic" aria-hidden />}>
      {c.featureFlags.items.length === 0 ? <Empty title="No feature flags yet">Flags are added by a reviewed migration; their default and per-firm overrides are changed here.</Empty> : (
        <DataTable caption="Feature flags" rows={c.featureFlags.items} rowKey={(f) => f.key} columns={[
          { key: "key", label: "Key", first: true, render: (f) => <span className="mono">{f.key}</span> },
          { key: "desc", label: "Description", render: (f) => f.description },
          { key: "on", label: "Default", render: (f) => <span className="badges"><Badge tone={f.enabled ? "ok" : "neutral"}>{f.enabled ? "On" : "Off"}</Badge><DangerBadge danger={f.danger} /></span> },
          { key: "ov", label: "Firm overrides", render: (f) => (f.overrides.length ? f.overrides.map((o) => `${o.firm_name ?? o.organization_id}: ${onOff(o.enabled)}`).join(", ") : "None") },
          { key: "act", label: <span className="sr-only">Change</span>, mobileLabel: "", render: (f) => (owner ? (
            <span className="badges">
              <button type="button" className={`btn sm${f.danger === "critical" ? " danger" : ""}`} onClick={() => toggle(f)}>{f.enabled ? "Turn off" : "Turn on"}</button>
              <button type="button" className="btn sm" onClick={() => onOverrides(f.key)}>Firm overrides</button>
            </span>
          ) : null) },
        ]} />
      )}
      <p className="foot" style={{ padding: "0 16px 14px" }}>A firm with an override gets that value; every other firm gets the default. The app reads flags on each request.</p>
    </Panel>
  );
}

function FlagOverrides({ flag, onClose, onPending }: { flag: Flag; onClose: () => void; onPending: (p: Pending) => void }) {
  const [firm, setFirm] = useState<PickedFirm[]>([]);
  const [value, setValue] = useState<"on" | "off">(flag.enabled ? "off" : "on");
  const set = (org: string, name: string, before: boolean | null, after: boolean | null) => onPending({
    kind: "setting", key: flag.key, label: `${flag.key} for ${name}`, before: onOff(before), after: onOff(after), danger: flag.danger, dangerNote: flag.danger_note,
    run: (r) => api.post(`/config/flags/${encodeURIComponent(flag.key)}/overrides`, { organizationId: org, enabled: after, reason: r.reason, confirm: r.confirm, code: r.code }),
  });
  const picked = firm[0];
  const existing = picked ? flag.overrides.find((o) => o.organization_id === picked.id) : undefined;
  return (
    <Drawer open title={<>Firm overrides · <span className="mono">{flag.key}</span></>} onClose={onClose}>
      <div className="form">
        <dl className="dl"><div><dt>Default</dt><dd>{onOff(flag.enabled)}</dd></div><div><dt>Overrides</dt><dd>{flag.overrides.length}</dd></div></dl>
        {flag.overrides.length ? (
          <DataTable caption="Overrides" rows={flag.overrides} rowKey={(o) => o.organization_id} columns={[
            { key: "firm", label: "Firm", first: true, render: (o) => o.firm_name ?? <span className="mono">{o.organization_id}</span> },
            { key: "v", label: "Value", render: (o) => onOff(o.enabled) },
            { key: "act", label: <span className="sr-only">Clear</span>, mobileLabel: "", render: (o) => <button type="button" className="btn sm" onClick={() => set(o.organization_id, o.firm_name ?? o.organization_id, o.enabled, null)}>Clear</button> },
          ]} />
        ) : <p className="muted">No firm overrides.</p>}
        <FirmPicker id="ov-firm" label="Add or change an override for" value={firm} onChange={setFirm} />
        <Field id="ov-value" label="Value for this firm">
          <Seg label="Value" value={value} onChange={setValue} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
        </Field>
        <button type="button" className="btn primary" disabled={!picked || (existing ? existing.enabled === (value === "on") : false)} onClick={() => picked && set(picked.id, picked.display_name, existing ? existing.enabled : null, value === "on")}>Review override</button>
      </div>
    </Drawer>
  );
}

function EditSetting({ setting, onClose, onReview }: { setting: Setting; onClose: () => void; onReview: (p: Pending) => void }) {
  const rule = setting.rule as SettingRule;
  const cur = setting.current as unknown;
  const [text, setText] = useState(rule.kind === "duration" ? String((cur as { count: number }).count) : cur === undefined || cur === null ? "" : String(cur));
  const [unit, setUnit] = useState(rule.kind === "duration" ? ((rule.units ?? []).includes((cur as { unit: string }).unit) ? (cur as { unit: string }).unit : (rule.units ?? [])[0]) : "");
  const [bool, setBool] = useState<"on" | "off">(cur === true ? "on" : "off");
  const input: unknown =
    rule.kind === "boolean" ? bool === "on"
      : rule.kind === "number" ? (text.trim() === "" ? NaN : Number(text))
      : rule.kind === "duration" ? { unit, count: text.trim() === "" ? NaN : Number(text) }
      : text;
  const problem = checkSettingInput(rule, input);
  const changed = !problem && !sameValue(nextStoredValue(rule, setting.value, input), setting.value);
  const hint = rule.kind === "number" ? `${Number(rule.min_value).toLocaleString("en-CA")} to ${Number(rule.max_value).toLocaleString("en-CA")}.` : rule.kind === "duration" ? "1 to 3650." : rule.kind === "text" ? `Up to ${rule.max_length} characters.` : undefined;
  const review = () => onReview({
    kind: "setting", key: setting.key, label: setting.description ?? setting.key, before: formatEditable(rule.kind, cur), after: formatEditable(rule.kind, rule.kind === "text" ? String(input).trim() : input), danger: rule.danger, dangerNote: rule.danger_note,
    run: (r) => api.patch(`/config/settings/${encodeURIComponent(setting.key)}`, { value: rule.kind === "text" ? String(input).trim() : input, expectedVersion: setting.version, reason: r.reason, confirm: r.confirm, code: r.code }),
  });
  return (
    <Drawer open title={<>Change <span className="mono">{setting.key}</span></>} onClose={onClose} dirty={changed} footer={
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="setting-form" className="btn primary" disabled={!changed}>Review change</button>
      </>
    }>
      <form id="setting-form" className="form" onSubmit={(e) => { e.preventDefault(); if (changed) review(); }}>
        <dl className="dl">
          <div><dt>Current value</dt><dd>{formatEditable(rule.kind, cur)}</dd></div>
          <div><dt>Version</dt><dd>{setting.version}</dd></div>
        </dl>
        {rule.danger !== "none" && rule.danger_note ? <Alert tone={rule.danger === "critical" ? "bad" : "warn"} title={rule.danger === "critical" ? "Dangerous setting" : "Check before changing"}>{rule.danger_note}</Alert> : null}
        {rule.kind === "boolean" ? (
          <Field id="s-value" label="Value"><Seg label="Value" value={bool} onChange={setBool} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} /></Field>
        ) : rule.kind === "enum" ? (
          <Field id="s-value" label="Value" error={text && problem ? problem : null}>
            <select id="s-value" className="sel" value={text} onChange={(e) => setText(e.target.value)}>
              {(rule.choices ?? []).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </Field>
        ) : rule.kind === "duration" ? (
          <div className="row2">
            <Field id="s-count" label="Count" hint={hint} error={text && problem ? problem : null}>
              <input id="s-count" className="inp" type="number" min={1} max={3650} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field id="s-unit" label="Unit">
              <select id="s-unit" className="sel" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {(rule.units ?? []).map((u) => <option key={u} value={u}>{u.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
          </div>
        ) : (
          <Field id="s-value" label="Value" hint={hint} error={text && problem ? problem : null}>
            <input id="s-value" className="inp" type={rule.kind === "number" ? "number" : "text"} min={rule.min_value ?? undefined} max={rule.max_value ?? undefined} maxLength={rule.max_length ?? undefined} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        {changed ? <Alert tone="info" title="Preview">{formatEditable(rule.kind, cur)} → {formatEditable(rule.kind, rule.kind === "text" ? String(input).trim() : input)}. Applies on the app&apos;s next request.</Alert> : null}
      </form>
    </Drawer>
  );
}

function ConfirmChange({ pending, onClose }: { pending: NonNullable<Pending>; onClose: (done: boolean) => void }) {
  const critical = needsTypedKey(pending.danger);
  return (
    <ConfirmDialog
      title={<>Change <span className="mono">{pending.key}</span>?</>}
      confirmLabel={critical ? "I understand, change it" : "Save change"}
      danger={critical}
      reason={{ min: 3, max: 500 }}
      typed={critical ? { label: <>Type <span className="mono">{pending.key}</span> to confirm</>, value: pending.key } : undefined}
      stepUp
      successToast="Change saved. Revert it from Recent changes."
      onConfirm={(v) => pending.run({ reason: v.reason, code: v.code, confirm: critical ? pending.key : undefined })}
      onClose={onClose}
    >
      <p>{pending.label}</p>
      <dl className="dl">
        <div><dt>Old value</dt><dd>{pending.before}</dd></div>
        <div><dt>New value</dt><dd><strong>{pending.after}</strong></dd></div>
      </dl>
      {critical ? (
        <Alert tone="bad" title="This is a dangerous switch">
          <span className="badges"><AlertTriangle className="ic" aria-hidden />{pending.dangerNote ?? "It changes behaviour for every firm at once."}</span> It applies to every firm on the app&apos;s next request. You can revert it in one click from Recent changes.
        </Alert>
      ) : pending.danger === "caution" && pending.dangerNote ? <Alert tone="warn" title="Check before changing">{pending.dangerNote}</Alert> : null}
    </ConfirmDialog>
  );
}

function ChangesPanel({ changes, owner }: { changes: Change[]; owner: boolean }) {
  const { withAuth, toast } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const revert = async (ch: Change) => {
    setBusy(ch.id);
    setError(null);
    try {
      await withAuth(() => api.post(`/config/changes/${ch.id}/revert`, { reason: `Reverted from the Config page (change ${ch.id.slice(0, 8)})` }));
      refreshAll();
      toast(`Reverted ${ch.config_key}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Recent changes" icon={<History className="ic" aria-hidden />}>
      {error ? <div style={{ padding: "0 16px" }}><ErrorAlert error={error} /></div> : null}
      {changes.length === 0 ? <Empty title="No changes from the portal yet" /> : (
        <DataTable caption="Recent changes" rows={changes} rowKey={(ch) => ch.id} columns={[
          { key: "at", label: "When", first: true, render: (ch) => when(ch.created_at) },
          { key: "key", label: "Key", render: (ch) => <span className="mono">{ch.config_key}{ch.firm_name ? ` · ${ch.firm_name}` : ""}</span> },
          { key: "chg", label: "Change", render: (ch) => <>{fmt(ch.old_value)} → <strong>{fmt(ch.new_value)}</strong>{ch.reverts_change_id ? <> <Badge>Revert</Badge></> : null}</> },
          { key: "why", label: "Reason", render: (ch) => ch.reason },
          { key: "act", label: <span className="sr-only">Revert</span>, mobileLabel: "", render: (ch) => (owner && ch.revertible ? (
            <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void revert(ch)}><RotateCcw className="ic" aria-hidden /> {busy === ch.id ? "Reverting…" : "Revert"}</button>
          ) : null) },
        ]} />
      )}
    </Panel>
  );
}

function fmt(v: unknown): string {
  if (v === true || v === false || v === null || v === undefined) return onOff(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ("unit" in o && "count" in o && Object.keys(o).length === 2) return formatSetting(o as SettingValue);
    const keys = Object.keys(o);
    if (keys.length === 1) return fmt(o[keys[0]]);
  }
  return typeof v === "number" ? v.toLocaleString("en-CA") : formatSetting(v as SettingValue);
}
