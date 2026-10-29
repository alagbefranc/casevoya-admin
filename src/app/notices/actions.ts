"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { estLocalToIso, firstIssue, postNoticeSchema, text, uuid } from "@/lib/forms";

function back(kind: "ok" | "error", message: string): never {
  redirect(`/notices?${kind}=${encodeURIComponent(message)}`);
}

export async function postNotice(form: FormData) {
  const admin = await requireAdmin();
  let parsed;
  try {
    parsed = postNoticeSchema.safeParse({
      kind: text(form, "kind"),
      severity: text(form, "severity") ?? "minor",
      title: text(form, "title") ?? "",
      body: text(form, "body") ?? "",
      startsAt: estLocalToIso(text(form, "startsAt")),
      endsAt: estLocalToIso(text(form, "endsAt")),
      audience: text(form, "audience"),
      firmIds: form.getAll("firmIds").filter((v): v is string => typeof v === "string"),
      publish: text(form, "publish") === "yes",
    });
  } catch (error) {
    back("error", error instanceof Error ? error.message : "Check the form");
  }
  if (!parsed.success) back("error", firstIssue(parsed.error));
  const v = parsed.data;
  const { data, error } = await admin.db.rpc("post_service_notice", {
    p_kind: v.kind,
    p_severity: v.severity,
    p_title: v.title,
    p_body: v.body,
    p_starts_at: v.startsAt,
    p_ends_at: v.endsAt,
    p_organization_ids: v.audience === "all" ? null : v.firmIds,
    p_publish: v.publish,
    p_acting_admin: admin.userId,
  });
  if (error) back("error", error.message);
  revalidatePath("/notices");
  back("ok", `Notice ${v.publish ? "published" : "saved as a draft"} (${String(data)}).`);
}

export async function updateNotice(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.safeParse(text(form, "id"));
  if (!id.success) back("error", "Unknown notice");
  let startsAt: string | null;
  let endsAt: string | null;
  try {
    startsAt = estLocalToIso(text(form, "startsAt"));
    endsAt = estLocalToIso(text(form, "endsAt"));
  } catch (error) {
    back("error", error instanceof Error ? error.message : "Check the times");
  }
  const severity = text(form, "severity");
  if (severity && !["info", "minor", "major"].includes(severity)) back("error", "Severity must be info, minor or major");
  const { error } = await admin.db.rpc("update_service_notice", {
    p_notice_id: id.data,
    p_severity: severity,
    p_title: text(form, "title"),
    p_body: text(form, "body"),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_publish: text(form, "publish") === "yes",
    p_acting_admin: admin.userId,
  });
  if (error) back("error", error.message);
  revalidatePath("/notices");
  back("ok", "Notice updated.");
}

export async function resolveNotice(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.safeParse(text(form, "id"));
  if (!id.success) back("error", "Unknown notice");
  const note = text(form, "note");
  if (!note || note.length > 1000) back("error", "Say how it was resolved (1 to 1000 characters)");
  const { error } = await admin.db.rpc("resolve_service_notice", { p_notice_id: id.data, p_resolution_note: note, p_acting_admin: admin.userId });
  if (error) back("error", error.message);
  revalidatePath("/notices");
  back("ok", "Notice resolved.");
}
