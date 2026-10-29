import { z } from "zod";

/** datetime-local value (no zone) read as EST (UTC-5, the operator's zone) and returned as ISO UTC. */
export function estLocalToIso(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) throw new Error("Times must look like 2026-10-29T22:00.");
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}-05:00`);
  if (Number.isNaN(d.getTime())) throw new Error("That time is not valid.");
  return d.toISOString();
}

export const uuid = z.string().uuid();

export const postNoticeSchema = z
  .object({
    kind: z.enum(["maintenance", "incident", "info"]),
    severity: z.enum(["info", "minor", "major"]),
    title: z.string().trim().min(3, "The title is 3 to 120 characters").max(120, "The title is 3 to 120 characters"),
    body: z.string().trim().min(1, "The notice text is 1 to 1000 characters").max(1000, "The notice text is 1 to 1000 characters"),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    audience: z.enum(["all", "listed"]),
    firmIds: z.array(uuid).max(500),
    publish: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "maintenance" && !v.endsAt) ctx.addIssue({ code: "custom", message: "Maintenance needs an end time" });
    if (v.audience === "listed" && v.firmIds.length === 0) ctx.addIssue({ code: "custom", message: "Choose at least one firm, or all firms" });
    if (v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt ?? new Date().toISOString())) ctx.addIssue({ code: "custom", message: "The end time is after the start time" });
  });

export const SCOPES = ["firm_settings", "matter_documents", "matter_records", "matter_all"] as const;

export const supportRequestSchema = z
  .object({
    organizationId: uuid,
    scope: z.enum(SCOPES),
    matterId: uuid.nullable(),
    requesterName: z.string().trim().min(1).max(120),
    ticketRef: z.string().trim().max(60).nullable(),
    notIncluded: z.string().trim().max(500).nullable(),
    reason: z.string().trim().min(8, "Give a reason of 8 to 1000 characters").max(1000, "Give a reason of 8 to 1000 characters"),
    minutes: z.number().int().min(15, "Support access lasts 15 to 240 minutes").max(240, "Support access lasts 15 to 240 minutes"),
    confirm: z.literal(true, { message: "Tick the box to confirm the firm's owners will be emailed" }),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "firm_settings" && v.matterId) ctx.addIssue({ code: "custom", message: "Firm settings access names no matter" });
    if (v.scope !== "firm_settings" && !v.matterId) ctx.addIssue({ code: "custom", message: "Matter access needs the matter id" });
  });

export function text(form: FormData, name: string): string | null {
  const v = form.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form";
}
