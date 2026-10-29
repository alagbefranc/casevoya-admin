import { z } from "zod";

/** Shared input pieces. Query strings arrive as text, so numbers and booleans are coerced. */
export const uuid = z.string().uuid("Must be a UUID");
export const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");
export const optionalCode = code.optional();
export const limit = (max = 200, fallback = 50) => z.coerce.number().int().min(1).max(max).default(fallback);
export const offset = z.coerce.number().int().min(0).max(100000).default(0);
export const boolish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");
export const isoTime = z.string().datetime({ offset: true, message: "Use an ISO 8601 time with a zone, e.g. 2026-10-29T22:00:00-05:00" });
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-29");
export const reason = (min: number, max: number) => z.string().trim().min(min, `Give a reason of ${min} to ${max} characters`).max(max, `Give a reason of ${min} to ${max} characters`);
export const empty = z.object({}).passthrough().transform(() => ({}));
export const idOnly = z.object({ id: uuid });
