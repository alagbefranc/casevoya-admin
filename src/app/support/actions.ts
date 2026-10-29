"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { firstIssue, supportRequestSchema, text, uuid } from "@/lib/forms";

function back(kind: "ok" | "error", message: string): never {
  redirect(`/support?${kind}=${encodeURIComponent(message)}`);
}

/** Creates a support access request. The firm's owners are emailed and must approve it in the app. */
export async function createSupportRequest(form: FormData) {
  const admin = await requireAdmin();
  const parsed = supportRequestSchema.safeParse({
    organizationId: text(form, "organizationId"),
    scope: text(form, "scope"),
    matterId: text(form, "matterId"),
    requesterName: text(form, "requesterName") ?? "Casevoya support",
    ticketRef: text(form, "ticketRef"),
    notIncluded: text(form, "notIncluded"),
    reason: text(form, "reason") ?? "",
    minutes: Number(text(form, "minutes") ?? "60"),
    confirm: text(form, "confirm") === "yes",
  });
  if (!parsed.success) back("error", firstIssue(parsed.error));
  const v = parsed.data;
  const { data, error } = await admin.db.rpc("create_support_access_request", {
    p_organization_id: v.organizationId,
    p_requester_name: v.requesterName,
    p_requester_email: admin.email,
    p_ticket_ref: v.ticketRef,
    p_scope: v.scope,
    p_matter_id: v.matterId,
    p_not_included: v.notIncluded,
    p_reason: v.reason,
    p_minutes: v.minutes,
    p_requested_by_user_id: admin.userId,
  });
  if (error) back("error", error.message);
  revalidatePath("/support");
  back("ok", `Request ${String(data)} sent. The firm's owners approve or decline it in the app.`);
}

/** Cancels a pending request, or gives an open grant back early. */
export async function cancelSupportRequest(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.safeParse(text(form, "id"));
  if (!id.success) back("error", "Unknown request");
  const { error } = await admin.db.rpc("cancel_support_access_request", { p_id: id.data, p_reason: text(form, "reason") });
  if (error) back("error", error.message);
  revalidatePath("/support");
  back("ok", "Request closed.");
}
