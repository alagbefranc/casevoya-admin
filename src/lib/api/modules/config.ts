import { z } from "zod";
import { ALL_ROLES, OWNERS, defineEndpoint, rpc } from "../core";
import { ApiError } from "../errors";
import { optionalCode, reason } from "../schemas";

export const FEATURE_FLAGS_GAP =
  "No feature-flag service yet. The switches shown are product settings whose value has an `enabled` boolean; per-firm or percentage flags do not exist.";

type SettingRow = { key: string; value: Record<string, unknown>; description: string | null; pending_confirmation: boolean; updated_at: string; version: number };

const SETTING_COLUMNS = "key, value, description, pending_confirmation, created_at, updated_at, version";
const settingKey = z.string().regex(/^[a-z][a-z0-9_.]{1,80}$/, "Unknown setting key");

export const configEndpoints = [
  defineEndpoint({
    method: "GET",
    path: "/config",
    summary: "Platform settings (product_settings) and the switches among them. Feature flags proper are a gap.",
    roles: ALL_ROLES,
    input: z.object({}),
    async handler({ db }) {
      const { data, error } = await db.from("product_settings").select(SETTING_COLUMNS).order("key");
      if (error) throw new ApiError("upstream_error", error.message);
      const settings = (data ?? []) as SettingRow[];
      const switches = settings
        .filter((s) => s.value && typeof s.value === "object" && typeof s.value.enabled === "boolean")
        .map((s) => ({ key: s.key, enabled: s.value.enabled as boolean, description: s.description }));
      return { settings, switches, featureFlags: { items: [], stub: true, gap: FEATURE_FLAGS_GAP } };
    },
  }),
  defineEndpoint({
    method: "PATCH",
    path: "/config/settings/:key",
    summary:
      "Change one product setting. Owner only, your own session with a fresh step-up; the database validates the value for known keys and records its own product.setting_changed audit event.",
    roles: OWNERS,
    input: z.object({
      key: settingKey,
      value: z
        .record(z.string(), z.unknown())
        .refine((v) => JSON.stringify(v).length <= 4000, "The value is at most 4000 characters of JSON"),
      reason: reason(3, 500),
      code: optionalCode,
    }),
    session: "step_up",
    audit: { action: "config.setting_changed", table: "public.product_settings" },
    async handler({ db, input, audit, userClient }) {
      const { data: before, error } = await db.from("product_settings").select(SETTING_COLUMNS).eq("key", input.key).maybeSingle();
      if (error) throw new ApiError("upstream_error", error.message);
      if (!before) throw new ApiError("not_found", "Setting not found");
      audit.context = { key: input.key, reason: input.reason, before: (before as SettingRow).value, after: input.value };
      const client = await userClient();
      await rpc(client, "set_product_setting", { p_key: input.key, p_value: input.value });
      const { data: after, error: afterError } = await db.from("product_settings").select(SETTING_COLUMNS).eq("key", input.key).maybeSingle();
      if (afterError) throw new ApiError("upstream_error", afterError.message);
      return after;
    },
  }),
];
