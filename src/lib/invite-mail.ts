import "server-only";
import type { InviteConfig } from "./env";
import type { FetchLike } from "./access-policy";

/** The invite email, sent with Cloudflare Email Sending (the same provider the Casevoya app uses). */

export type InviteMail = { to: string; role: "owner" | "operator" | "viewer"; templateReviewer: boolean; invitedBy: string; expiresAt: string; acceptUrl: string; note: string | null };

export const ROLE_SUMMARY: Record<InviteMail["role"], string> = {
  owner: "Owner: everything an operator can do, plus product settings and managing admins.",
  operator: "Operator: handles support, notices, retries, licence checks and template drafts.",
  viewer: "Viewer: can read everything in the portal but cannot change anything.",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function inviteMailContent(m: InviteMail): { subject: string; text: string; html: string } {
  const expires = new Date(m.expiresAt).toUTCString().replace(/:\d\d GMT$/, " UTC");
  const role = `${ROLE_SUMMARY[m.role]}${m.templateReviewer && m.role !== "viewer" ? " You can also review shared templates." : ""}`;
  const steps = [
    `Open ${m.acceptUrl}`,
    `Cloudflare Access asks for your email (${m.to}) and sends you a one-time code. Enter it.`,
    "If you don't have a Casevoya account yet, create one there with a password and add an authenticator app (Google Authenticator, 1Password, Authy...). If you do, sign in with your password and authenticator code.",
    "Tick \"I accept\" and press Accept invite.",
  ];
  const subject = `You're invited to Casevoya admin as ${m.role === "owner" || m.role === "operator" ? "an" : "a"} ${m.role}`;
  const text = [
    `${m.invitedBy} invited you to the Casevoya admin portal.`,
    "",
    role,
    m.note ? `Note: ${m.note}` : null,
    "",
    "To accept:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `The invite expires ${expires}.`,
    "If you didn't expect this, ignore this email. Nothing happens unless you accept.",
  ].filter((l) => l !== null).join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:560px">
<p>${esc(m.invitedBy)} invited you to the <b>Casevoya admin</b> portal.</p>
<p>${esc(role)}</p>${m.note ? `\n<p><i>Note:</i> ${esc(m.note)}</p>` : ""}
<p><a href="${esc(m.acceptUrl)}" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Accept the invite</a></p>
<ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<p style="color:#6e6e73">The invite expires ${esc(expires)}. If you didn't expect this, ignore this email. Nothing happens unless you accept.</p>
</div>`;
  return { subject, text, html };
}

export type MailResult = { sent: true; messageId: string | null } | { sent: false; error: string };

export async function sendInviteMail(config: InviteConfig, m: InviteMail, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<MailResult> {
  const content = inviteMailContent(m);
  try {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ to: m.to, from: { address: config.mailFrom, name: "Casevoya admin" }, subject: content.subject, text: content.text, html: content.html }),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message?: string }[]; result?: { message_id?: string; permanent_bounces?: string[]; suppressed_recipients?: string[] } } | null;
    if (!res.ok || !body?.success) return { sent: false, error: body?.errors?.[0]?.message ?? `HTTP ${res.status}` };
    if (body.result?.permanent_bounces?.length || body.result?.suppressed_recipients?.length) return { sent: false, error: "The address bounced or is suppressed" };
    return { sent: true, messageId: body.result?.message_id ?? null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "network error" };
  }
}
