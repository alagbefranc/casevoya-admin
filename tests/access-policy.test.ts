import { describe, expect, it } from "vitest";
import { AccessPolicyError, includeFor, ruleEmail, syncAccessPolicy, type FetchLike } from "@/lib/access-policy";
import { inviteMailContent, sendInviteMail } from "@/lib/invite-mail";
import { readInviteConfig } from "@/lib/env";

const config = { accountId: "a".repeat(32), accessAppId: "76c4d190-fcd6-498d-a63e-5e9b8a968dab", accessPolicyId: "27c25915-8305-45a6-b642-f10a8a768baf", token: "t".repeat(30), mailFrom: "notices@casevoya.ca" };
const policy = (include: unknown[]) => ({ id: config.accessPolicyId, name: "Allow admin@casevoya.ca", decision: "allow", include, exclude: [], require: [], precedence: 1, session_duration: "12h", mfa_config: { mfa_disabled: true } });

function fake(include: unknown[], put = { ok: true, success: true }) {
  const calls: { method: string; body?: Record<string, unknown> }[] = [];
  const f: FetchLike = async (_url, init) => {
    calls.push({ method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === "GET") return { ok: true, status: 200, json: async () => ({ success: true, result: policy(include) }) };
    return { ok: put.ok, status: put.ok ? 200 : 403, json: async () => ({ success: put.success }) };
  };
  return { f, calls };
}
const OWNER = { email: { email: "admin@casevoya.ca" } };

describe("Access policy sync", () => {
  it("adds an invited email, keeping the owner and every other policy field", async () => {
    const { f, calls } = fake([OWNER]);
    const out = await syncAccessPolicy(config, { keep: ["admin@casevoya.ca"], members: ["admin@casevoya.ca", "Worker@Mail.Grokbot.com"] }, f);
    expect(out).toMatchObject({ added: ["worker@mail.grokbot.com"], removed: [], changed: true });
    expect(calls[1].body).toEqual({
      name: "Allow admin@casevoya.ca",
      decision: "allow",
      include: [OWNER, { email: { email: "worker@mail.grokbot.com" } }],
      exclude: [],
      require: [],
      precedence: 1,
      session_duration: "12h",
      mfa_config: { mfa_disabled: true },
    });
  });
  it("removes an email that is no longer an admin or invited, never the static owner", async () => {
    const { f, calls } = fake([OWNER, { email: { email: "worker@mail.grokbot.com" } }]);
    const out = await syncAccessPolicy(config, { keep: ["admin@casevoya.ca"], members: [] }, f);
    expect(out.removed).toEqual(["worker@mail.grokbot.com"]);
    expect(calls[1].body?.include).toEqual([OWNER]);
  });
  it("does not write when nothing changes", async () => {
    const { f, calls } = fake([OWNER]);
    expect((await syncAccessPolicy(config, { keep: ["admin@casevoya.ca"], members: [] }, f)).changed).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });
  it.each([[{ everyone: {} }], [{ email_domain: { domain: "casevoya.ca" } }], [{ group: { id: "g" } }], [{ email: { email: "*@casevoya.ca" } }]])("refuses to touch a policy with a non-email rule %j", async (rule) => {
    const { f, calls } = fake([OWNER, rule]);
    await expect(syncAccessPolicy(config, { keep: ["admin@casevoya.ca"], members: [] }, f)).rejects.toBeInstanceOf(AccessPolicyError);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });
  it("refuses to write anything that is not one exact email", () => {
    expect(() => includeFor(["@casevoya.ca"])).toThrow(AccessPolicyError);
    expect(() => includeFor(["*@casevoya.ca"])).toThrow(AccessPolicyError);
    expect(() => includeFor(["a@b.co,c@d.co"])).toThrow(AccessPolicyError);
    expect(ruleEmail({ everyone: {} })).toBeNull();
  });
  it("refuses with no static email to keep", async () => {
    const { f, calls } = fake([OWNER]);
    await expect(syncAccessPolicy(config, { keep: [], members: ["x@y.co"] }, f)).rejects.toThrow(/No static admin/);
    expect(calls).toEqual([]);
  });
  it("fails when Cloudflare refuses the update", async () => {
    const { f } = fake([OWNER], { ok: false, success: false });
    await expect(syncAccessPolicy(config, { keep: ["admin@casevoya.ca"], members: ["w@mail.grokbot.com"] }, f)).rejects.toThrow(/Could not update/);
  });
});

describe("invite email", () => {
  const mail = { to: "worker@mail.grokbot.com", role: "operator" as const, templateReviewer: false, invitedBy: "admin@casevoya.ca", expiresAt: "2026-11-06T02:00:00Z", acceptUrl: "https://admin.casevoya.ca/join", note: "<b>hi</b>" };
  it("explains the role and the steps, links /join, and escapes the note", () => {
    const c = inviteMailContent(mail);
    expect(c.subject).toBe("You're invited to Casevoya admin as an operator");
    expect(c.text).toMatch(/Operator: handles support/);
    expect(c.text).toMatch(/one-time code/);
    expect(c.html).toContain('href="https://admin.casevoya.ca/join"');
    expect(c.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });
  it("sends with Cloudflare Email Sending from notices@casevoya.ca", async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const f: FetchLike = async (url, init) => {
      sent = { url, body: JSON.parse(init.body ?? "{}") };
      return { ok: true, status: 200, json: async () => ({ success: true, result: { message_id: "<m@casevoya.ca>", permanent_bounces: [], suppressed_recipients: [] } }) };
    };
    expect(await sendInviteMail(config, mail, f)).toEqual({ sent: true, messageId: "<m@casevoya.ca>" });
    expect(sent!.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`);
    expect(sent!.body).toMatchObject({ to: mail.to, from: { address: "notices@casevoya.ca" } });
  });
  it("reports a failure instead of throwing", async () => {
    const f: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: "denied" }] }) });
    expect(await sendInviteMail(config, mail, f)).toEqual({ sent: false, error: "denied" });
  });
  it("invite config needs every part", () => {
    const src = { CF_ACCOUNT_ID: config.accountId, CF_ACCESS_APP_ID: config.accessAppId, CF_ACCESS_POLICY_ID: config.accessPolicyId, CF_ADMIN_TOKEN: config.token };
    expect(readInviteConfig(src)).toMatchObject({ mailFrom: "notices@casevoya.ca" });
    expect(readInviteConfig({ ...src, CF_ADMIN_TOKEN: "" })).toBeNull();
  });
});
