import { z } from "zod";
import { ALL_ROLES, OWNERS, defineEndpoint, rpc } from "../core";
import { ApiError, fromDbError } from "../errors";
import { optionalCode, reason } from "../schemas";

export const FEATURE_FLAGS_GAP =
  "No feature-flag service yet. The switches shown are product settings whose value has an `enabled` boolean; per-firm or percentage flags do not exist.";

type SettingRow = { key: string; value: Record<string, unknown>; description: string | null; pending_confirmation: boolean; updated_at: string; version: number };

const SETTING_COLUMNS = "key, value, description, pending_confirmation, created_at, updated_at, version";
const settingKey = z.string().regex(/^[a-z][a-z0-9_.]{1,80}$/, "Unknown setting key");

/**
 * The database's set_product_setting writes only `{unit, count}` values (it rebuilds the value from those two
 * fields and rejects anything else), so only settings already stored in that shape are editable from the portal.
 */
export function isEditableSetting(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 2 && typeof v.unit === "string" && Number.isInteger(v.count);
}

/** Units the portal accepts per key (the database checks trial.duration, licence.recheck_interval and licence.manual_check_target). */
export function allowedUnits(key: string): string[] {
  return key === "licence.manual_check_target" ? ["business_days"] : ["days", "months"];
}

export const NOT_EDITABLE =
  "This setting is not editable from the portal: the database's setting function only writes {unit, count} values. Change it with a reviewed migration.";

export const configEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/config",
    summary: "Platform settings (product_settings) and the switches among them. Feature flags proper are a gap.",
    roles: ALL_ROLES,
    input: z.object({}),
    async handler({ db }) {
      const { data, error } = await db.from("product_settings").select(SETTING_COLUMNS).order("key");
      if (error) throw fromDbError(error);
      const settings = ((data ?? []) as SettingRow[]).map((s) => ({
        ...s,
        editable: isEditableSetting(s.value),
        allowed_units: isEditableSetting(s.value) ? allowedUnits(s.key) : [],
      }));
      const switches = settings
        .filter((s) => s.value && typeof s.value === "object" && typeof s.value.enabled === "boolean")
        .map((s) => ({ key: s.key, enabled: s.value.enabled as boolean, description: s.description, editable: false }));
      return { settings, switches, featureFlags: { items: [], stub: true, gap: FEATURE_FLAGS_GAP } };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/config/settings/:key",
    summary:
      "Change one {unit, count} product setting (trial length, licence and source recheck intervals, manual check target). Owner only, your own session with a fresh step-up; the database validates the value for known keys and records its own product.setting_changed audit event.",
    roles: OWNERS,
    input: z.object({
      key: settingKey,
      value: z
        .object({
          unit: z.enum(["days", "months", "business_days"], { message: "The unit is days, months or business_days" }),
          count: z.number().int("The count is a whole number").min(1, "The count is 1 to 3650").max(3650, "The count is 1 to 3650"),
        })
        .strict(),
      reason: reason(3, 500),
      code: optionalCode,
    }),
    session: "step_up",
    auditRequired: true,
    audit: { action: "config.setting_changed", table: "public.product_settings" },
    async handler({ db, input, audit, userClient }) {
      const { data: before, error } = await db.from("product_settings").select(SETTING_COLUMNS).eq("key", input.key).maybeSingle();
      if (error) throw fromDbError(error);
      if (!before) throw new ApiError("not_found", "Setting not found");
      if (!isEditableSetting((before as SettingRow).value)) throw new ApiError("conflict", NOT_EDITABLE);
      if (!allowedUnits(input.key).includes(input.value.unit)) {
        const message = `${input.key} uses ${allowedUnits(input.key).join(" or ")}`;
        throw new ApiError("validation_failed", message, { issues: [{ path: "value.unit", message }] });
      }
      audit.context = { key: input.key, reason: input.reason, before: (before as SettingRow).value, after: input.value };
      const client = await userClient();
      await rpc(client, "set_product_setting", { p_key: input.key, p_value: input.value });
      const { data: after, error: afterError } = await db.from("product_settings").select(SETTING_COLUMNS).eq("key", input.key).maybeSingle();
      if (afterError) throw fromDbError(afterError);
      return after;
    },
  }),
];
