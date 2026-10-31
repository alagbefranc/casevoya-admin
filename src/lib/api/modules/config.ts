import { z } from "zod";
import { ALL_ROLES, OWNERS, defineEndpoint, rpc } from "../core";
import { ApiError, fromDbError } from "../errors";
import { optionalCode, reason, uuid } from "../schemas";
import { checkSettingInput, editableValue, needsTypedKey, nextStoredValue, sameValue, type SettingRule } from "@/lib/config-rules";

type SettingRow = { key: string; value: Record<string, unknown>; description: string | null; pending_confirmation: boolean; created_at?: string; updated_at: string | null; version: number };
type FlagRow = { key: string; description: string; enabled: boolean; danger: SettingRule["danger"]; danger_note: string | null; version: number; created_at: string; updated_at: string | null };
type OverrideRow = { flag_key: string; organization_id: string; enabled: boolean; updated_at: string | null; created_at: string };
type ChangeRow = { id: string; target: "setting" | "flag" | "flag_override"; config_key: string; organization_id: string | null; old_value: unknown; new_value: unknown; reason: string; actor_user_id: string | null; reverts_change_id: string | null; created_at: string };

const SETTING_COLUMNS = "key, value, description, pending_confirmation, created_at, updated_at, version";
const RULE_COLUMNS = "key, kind, field, min_value, max_value, choices, units, max_length, pattern, danger, danger_note";
const FLAG_COLUMNS = "key, description, enabled, danger, danger_note, version, created_at, updated_at";
const CHANGE_COLUMNS = "id, target, config_key, organization_id, old_value, new_value, reason, actor_user_id, reverts_change_id, created_at";
const configKey = z.string().regex(/^[a-z][a-z0-9_.]{1,80}$/, "Unknown key");
const expectedVersion = z.number({ message: "Reload the page and try again" }).int().min(1);
const confirm = z.string().trim().max(120).optional();
const CHANGES_SHOWN = 30;

export const NOT_EDITABLE =
  "This setting is not editable from the portal (legal text, addresses, plans, prices and multi-part limits change through a reviewed migration).";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function normalizeRule(r: Record<string, unknown>): SettingRule {
  return { ...(r as SettingRule), min_value: num(r.min_value), max_value: num(r.max_value) };
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw fromDbError(error as never);
  return (data ?? []) as T[];
}

/** The latest change per (target, key, firm) is the only one that can be reverted. */
export function markRevertible(changes: ChangeRow[]): (ChangeRow & { revertible: boolean })[] {
  const seen = new Set<string>();
  return changes.map((c) => {
    const k = `${c.target}|${c.config_key}|${c.organization_id ?? ""}`;
    const first = !seen.has(k);
    seen.add(k);
    return { ...c, revertible: first };
  });
}

function bad(path: string, message: string): ApiError {
  return new ApiError("validation_failed", message, { issues: [{ path, message }] });
}

export const configEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/config",
    summary: "Product settings with their edit rules, the on/off switches among them, feature flags with per-firm overrides, and recent config changes.",
    roles: ALL_ROLES,
    input: z.object({}),
    async handler({ db }) {
      const [settingRows, ruleRows, flagRows, overrideRows, changeRows] = await Promise.all([
        rows<SettingRow>(db.from("product_settings").select(SETTING_COLUMNS).order("key")),
        rows<Record<string, unknown>>(db.from("product_setting_rules").select(RULE_COLUMNS)),
        rows<FlagRow>(db.from("feature_flags").select(FLAG_COLUMNS).order("key")),
        rows<OverrideRow>(db.from("feature_flag_overrides").select("flag_key, organization_id, enabled, created_at, updated_at")),
        rows<ChangeRow>(db.from("platform_config_changes").select(CHANGE_COLUMNS).order("created_at", { ascending: false }).limit(CHANGES_SHOWN)),
      ]);
      const orgIds = [...new Set([...overrideRows.map((o) => o.organization_id), ...changeRows.map((c) => c.organization_id).filter((x): x is string => Boolean(x))])];
      const firms = orgIds.length ? await rows<{ id: string; display_name: string }>(db.from("organizations").select("id, display_name").in("id", orgIds)) : [];
      const firmName = new Map(firms.map((f) => [f.id, f.display_name]));
      const rules = new Map(ruleRows.map((r) => [String(r.key), normalizeRule(r)]));

      const settings = settingRows.map((s) => {
        const rule = rules.get(s.key) ?? null;
        return {
          ...s,
          editable: Boolean(rule),
          rule,
          current: rule ? editableValue(rule, s.value) : null,
          allowed_units: rule?.kind === "duration" ? (rule.units ?? []) : [],
        };
      });
      const switches = settings
        .filter((s) => s.value && typeof s.value === "object" && typeof s.value.enabled === "boolean")
        .map((s) => ({
          key: s.key,
          enabled: s.value.enabled as boolean,
          description: s.description,
          version: s.version,
          updated_at: s.updated_at,
          editable: s.rule?.kind === "boolean" && s.rule.field === "enabled",
          danger: s.rule?.danger ?? "none",
          danger_note: s.rule?.danger_note ?? null,
        }));
      const flags = flagRows.map((f) => ({
        ...f,
        editable: true,
        overrides: overrideRows
          .filter((o) => o.flag_key === f.key)
          .map((o) => ({ ...o, firm_name: firmName.get(o.organization_id) ?? null }))
          .sort((a, b) => String(a.firm_name).localeCompare(String(b.firm_name))),
      }));
      const changes = markRevertible(changeRows).map((c) => ({ ...c, firm_name: c.organization_id ? (firmName.get(c.organization_id) ?? null) : null }));
      return { settings, switches, featureFlags: { items: flags, perFirmOverrides: true }, changes };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/config/settings/:key",
    summary:
      "Change one product setting or switch by its rule (boolean, number range, enum, duration, text). Owner only, own session with a fresh step-up; critical switches need the key typed; the database re-checks, keeps the history and audits.",
    roles: OWNERS,
    input: z.object({
      key: configKey,
      value: z.unknown().refine((v) => v !== undefined && v !== null, "Enter a value"),
      expectedVersion,
      reason: reason(3, 500),
      confirm,
      code: optionalCode,
    }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "config.setting_changed", table: "public.product_settings" },
    async handler({ db, input, audit, userClient }) {
      const { data: before, error } = await db.from("product_settings").select(SETTING_COLUMNS).eq("key", input.key).maybeSingle();
      if (error) throw fromDbError(error);
      if (!before) throw new ApiError("not_found", "Setting not found");
      const { data: ruleRow, error: ruleError } = await db.from("product_setting_rules").select(RULE_COLUMNS).eq("key", input.key).maybeSingle();
      if (ruleError) throw fromDbError(ruleError);
      if (!ruleRow) throw new ApiError("conflict", NOT_EDITABLE);
      const rule = normalizeRule(ruleRow as Record<string, unknown>);
      const problem = checkSettingInput(rule, input.value);
      if (problem) throw bad(rule.kind === "duration" ? "value.count" : "value", problem);
      const stored = (before as SettingRow).value;
      const after = nextStoredValue(rule, stored, input.value);
      if (sameValue(after, stored)) throw bad("value", "That is already the value");
      if (needsTypedKey(rule.danger) && input.confirm !== input.key) throw bad("confirm", `Type ${input.key} to confirm`);
      audit.context = { key: input.key, reason: input.reason, before: stored, after, danger: rule.danger };
      const client = await userClient();
      const result = await rpc<{ change_id: string }>(client, "admin_config_set_setting", {
        p_key: input.key,
        p_value: input.value,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_confirm: input.confirm ?? null,
      });
      if (result?.change_id) audit.objectId = result.change_id;
      return result;
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/config/flags/:key",
    summary: "Turn a feature flag's default on or off for every firm without an override. Owner only, fresh step-up; critical flags need the key typed.",
    roles: OWNERS,
    input: z.object({ key: configKey, enabled: z.boolean({ message: "Choose on or off" }), expectedVersion, reason: reason(3, 500), confirm, code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "config.flag_changed", table: "public.feature_flags" },
    async handler({ db, input, audit, userClient }) {
      const { data: flag, error } = await db.from("feature_flags").select(FLAG_COLUMNS).eq("key", input.key).maybeSingle();
      if (error) throw fromDbError(error);
      if (!flag) throw new ApiError("not_found", "Feature flag not found");
      const f = flag as FlagRow;
      if (f.enabled === input.enabled) throw bad("enabled", "That is already the value");
      if (needsTypedKey(f.danger) && input.confirm !== input.key) throw bad("confirm", `Type ${input.key} to confirm`);
      audit.context = { key: input.key, reason: input.reason, before: f.enabled, after: input.enabled };
      const client = await userClient();
      const result = await rpc<{ change_id: string }>(client, "admin_config_set_flag", {
        p_key: input.key, p_enabled: input.enabled, p_expected_version: input.expectedVersion, p_reason: input.reason, p_confirm: input.confirm ?? null,
      });
      if (result?.change_id) audit.objectId = result.change_id;
      return result;
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/config/flags/:key/overrides",
    summary: "Set one firm's override of a feature flag (on or off), or clear it with enabled null. Owner only, fresh step-up.",
    roles: OWNERS,
    input: z.object({
      key: configKey,
      organizationId: uuid,
      enabled: z.boolean().nullable(),
      reason: reason(3, 500),
      confirm,
      code: optionalCode,
    }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "config.flag_override_changed", table: "public.feature_flag_overrides" },
    async handler({ db, input, audit, userClient }) {
      const { data: flag, error } = await db.from("feature_flags").select(FLAG_COLUMNS).eq("key", input.key).maybeSingle();
      if (error) throw fromDbError(error);
      if (!flag) throw new ApiError("not_found", "Feature flag not found");
      if (needsTypedKey((flag as FlagRow).danger) && input.confirm !== input.key) throw bad("confirm", `Type ${input.key} to confirm`);
      audit.organizationId = input.organizationId;
      audit.context = { key: input.key, reason: input.reason, after: input.enabled };
      const client = await userClient();
      const result = await rpc<{ change_id: string; before: unknown }>(client, "admin_config_set_flag_override", {
        p_key: input.key, p_organization_id: input.organizationId, p_enabled: input.enabled, p_reason: input.reason, p_confirm: input.confirm ?? null,
      });
      if (result?.change_id) audit.objectId = result.change_id;
      audit.context = { ...audit.context, before: result?.before ?? null };
      return result;
    },
  }),
  defineEndpoint({
    method: "POST",
    path: "/config/changes/:id/revert",
    summary: "Put back the value a config change replaced (the latest change of that setting, flag or override only). No typed confirmation, so a dangerous switch can always be turned back. Owner only, fresh step-up.",
    roles: OWNERS,
    input: z.object({ id: uuid, reason: reason(3, 500), code: optionalCode }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "config.change_reverted", table: "public.platform_config_changes" },
    async handler({ input, audit, userClient }) {
      audit.context = { reverts: input.id, reason: input.reason };
      const client = await userClient();
      const result = await rpc<{ change_id: string; key: string; before: unknown; after: unknown }>(client, "admin_config_revert", { p_change_id: input.id, p_reason: input.reason });
      audit.context = { ...audit.context, key: result?.key ?? null, before: result?.before ?? null, after: result?.after ?? null };
      return result;
    },
  }),
];
