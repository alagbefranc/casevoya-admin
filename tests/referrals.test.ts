import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describe as describeError } from "@/client/api";
import { ApiFailure } from "@/client/api";
import {
  SYNTHETIC_REFERRAL, canSend, claimSend, finishSend, fixtureHasSecret, keptFirm, releaseSend, roleCanSend, sendBody,
  type ConnectRequest,
} from "@/client/referrals";
import { handle } from "@/lib/api/core";
import { fromDbError } from "@/lib/api/errors";
import { ENDPOINTS } from "@/lib/api/registry";
import { AdminDenied } from "@/lib/guard";
import { ID, ME, ORG, deps, fakeDb, req } from "./api-helpers";

const LEAD = "55555555-5555-4555-8555-555555555555";
const FIRM = "66666666-6666-4666-8666-666666666666";
const stepUpOk = { platform_step_up_check: { ok: true, user_id: ME } };
const row = {
  id: ID,
  status: "New",
  goal: "Study permit",
  country: "Nigeria",
  code: "CA",
  zone: "Ontario",
  language: "English",
  name: "Fixture Person",
  email: "fixture.person@example.com",
  submitted_at: "2026-11-07T15:04:00.000Z",
  organization_id: null,
  firm_name: null,
  lead_id: null,
  sent_at: null,
  ip_hash: "deadbeef",
  user_agent: "secret-agent",
};
const listOk = { items: [row], counts: { new: 1, sent: 0 } };
const sent = { id: ID, status: "Sent" as const, organization_id: ORG, lead_id: LEAD, replayed: false };
const request: ConnectRequest = {
  id: ID,
  status: "New",
  goal: "Study permit",
  country: "Nigeria",
  code: "CA",
  zone: "Ontario",
  language: "English",
  name: "Fixture Person",
  email: "fixture.person@example.com",
  submitted_at: "2026-11-07T15:04:00.000Z",
  organization_id: null,
  firm_name: null,
  lead_id: null,
  sent_at: null,
};

async function call(method: "GET" | "POST", url: string, opts: Parameters<typeof deps>[0], body?: Record<string, unknown>) {
  const d = deps({ session: "fresh", ...opts });
  const res = await handle(req(method, url, body), ENDPOINTS, d);
  const json = (await res.json()) as { data?: Record<string, unknown>; error?: { code: string; message: string } };
  return { res, json, d };
}

describe("referrals API", () => {
  it("lets a viewer read New requests and leaves out the address hash", async () => {
    const { res, json, d } = await call("GET", "/referrals?state=new", { role: "viewer", db: fakeDb({ platform_consultant_connect_requests: listOk }) });
    expect(res.status).toBe(200);
    const text = JSON.stringify(json.data);
    expect(text).not.toMatch(/ip_hash|user_agent|deadbeef|secret-agent/);
    const item = (json.data?.items as Record<string, unknown>[])[0];
    expect(item).toMatchObject({ name: "Fixture Person", email: "fixture.person@example.com", goal: "Study permit", country: "Nigeria", language: "English", status: "New" });
    expect(d.db.reads).not.toContain("consultant_connect_requests");
  });

  it("refuses the firm list and Send for a viewer, and does not call Send", async () => {
    const firms = await call("GET", "/referrals/firms", { role: "viewer", db: fakeDb({ platform_find_introduction_firms: { items: [{ id: ORG, display_name: "A" }] } }) });
    expect(firms.res.status).toBe(403);
    expect(firms.json.error?.code).toBe("forbidden");
    expect(firms.d.db.calls.map((c) => c.fn)).not.toContain("platform_find_introduction_firms");

    const send = await call("POST", `/referrals/${ID}/send`, {
      role: "viewer",
      db: fakeDb({ platform_send_consultant_connect: sent, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(send.res.status).toBe(403);
    expect(send.json.data).toBeUndefined();
    expect(send.d.db.calls.map((c) => c.fn)).not.toContain("platform_send_consultant_connect");
  });

  it("lets an owner and an operator send, and returns the one lead", async () => {
    for (const role of ["owner", "operator"] as const) {
      const { res, json, d } = await call("POST", `/referrals/${ID}/send`, {
        role,
        db: fakeDb({ platform_send_consultant_connect: sent, ...stepUpOk }),
        userDb: fakeDb(stepUpOk),
      }, { organizationId: ORG, confirmSend: true, code: "123456" });
      expect(res.status, role).toBe(200);
      expect(json.data).toEqual(sent);
      expect(Object.keys(json.data ?? {}).sort()).toEqual(["id", "lead_id", "organization_id", "replayed", "status"]);
      const rpc = d.db.calls.find((c) => c.fn === "platform_send_consultant_connect");
      expect(rpc?.args).toEqual({ p_request: ID, p_org: ORG, p_admin_user_id: ME });
      expect(d.userDb.calls.map((c) => c.fn)).toContain("platform_step_up_check");
      expect(d.db.calls.map((c) => c.fn)).not.toContain("platform_step_up_check");
    }
  });

  it("refuses a missing Access session and a bad Access token before any function call", async () => {
    for (const reason of ["no_access_jwt", "bad_access_jwt"] as const) {
      const denied = deps({ denied: new AdminDenied(reason, "no Access session"), db: fakeDb({ platform_consultant_connect_requests: listOk }) });
      const res = await handle(req("GET", "/referrals?state=new"), ENDPOINTS, denied);
      expect(res.status).toBe(401);
      expect(denied.db.calls).toEqual([]);
    }
  });

  it("refuses an email that is not allowed and a user who is not a platform admin", async () => {
    for (const reason of ["email_not_allowed", "not_platform_admin"] as const) {
      const denied = deps({ denied: new AdminDenied(reason, "no"), db: fakeDb({ platform_send_consultant_connect: sent }) });
      const res = await handle(req("POST", `/referrals/${ID}/send`, { organizationId: ORG, confirmSend: true }), ENDPOINTS, denied);
      expect(res.status).toBe(403);
      expect(denied.db.calls.map((c) => c.fn)).not.toContain("platform_send_consultant_connect");
    }
  });

  it("requires a fresh step-up and does not send when the proof fails", async () => {
    const stale = await call("POST", `/referrals/${ID}/send`, {
      role: "operator",
      session: "stale",
      db: fakeDb({ platform_send_consultant_connect: sent, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true });
    expect(stale.res.status).toBe(403);
    expect(stale.json.error?.code).toBe("step_up_required");
    expect(stale.d.db.calls.map((c) => c.fn)).not.toContain("platform_send_consultant_connect");

    const unproven = await call("POST", `/referrals/${ID}/send`, {
      role: "operator",
      db: fakeDb({ platform_send_consultant_connect: sent }),
      userDb: fakeDb({ platform_step_up_check: { ok: false, user_id: ME } }),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(unproven.res.status).toBe(403);
    expect(unproven.json.error?.code).toBe("step_up_required");
    expect(unproven.d.db.calls.map((c) => c.fn)).not.toContain("platform_send_consultant_connect");
  });

  it("returns no firms when none are eligible", async () => {
    const { res, json } = await call("GET", "/referrals/firms", { role: "operator", db: fakeDb({ platform_find_introduction_firms: { items: [] } }) });
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ items: [] });
  });

  it("shows the database refusal for an opted-out firm and does not report Sent", async () => {
    const { res, json, d } = await call("POST", `/referrals/${ID}/send`, {
      role: "operator",
      db: fakeDb({ platform_send_consultant_connect: { error: { code: "22023", message: "This firm is not accepting introductions." } }, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(res.status).toBe(422);
    expect(json.error?.message).toBe("This firm is not accepting introductions.");
    expect(json.data).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/"status":"Sent"/);
    const names = d.db.calls.map((c) => c.fn);
    expect(names.filter((fn) => fn === "platform_send_consultant_connect")).toHaveLength(1);
  });

  it("says the migration is not applied when the send function is missing", async () => {
    const missing = fromDbError({ code: "PGRST202", message: "Could not find the function public.platform_send_consultant_connect" });
    expect(missing.code).toBe("upstream_error");
    expect(missing.message).toMatch(/main-app migration/);
    expect(describeError(new ApiFailure(missing.code, missing.message, missing.status, "r")).title).toMatch(/migration/);

    const { res, json } = await call("POST", `/referrals/${ID}/send`, {
      role: "owner",
      db: fakeDb({ platform_send_consultant_connect: { error: { code: "PGRST202", message: "Could not find the function" } }, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(res.status).toBe(502);
    expect(json.error?.message).toMatch(/migration/);
    expect(json.data).toBeUndefined();

    const list = await call("GET", "/referrals?state=new", {
      role: "viewer",
      db: fakeDb({ platform_consultant_connect_requests: { error: { code: "PGRST202", message: "Could not find the function" } } }),
    });
    expect(list.res.status).toBe(502);
    expect(list.json.error?.message).toMatch(/migration/);
    expect(list.json.data).toBeUndefined();
  });

  it("refuses Send when confirm is missing and does not call the function", async () => {
    const { res, json, d } = await call("POST", `/referrals/${ID}/send`, {
      role: "owner",
      db: fakeDb({ platform_send_consultant_connect: sent, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: false, code: "123456" });
    expect(res.status).toBe(422);
    expect(json.error?.code).toBe("validation_failed");
    expect(d.db.calls.map((c) => c.fn)).not.toContain("platform_send_consultant_connect");
  });

  it("returns the same lead when the firm was already sent, and refuses a different firm", async () => {
    const replayed = { ...sent, replayed: true };
    const again = await call("POST", `/referrals/${ID}/send`, {
      role: "operator",
      db: fakeDb({ platform_send_consultant_connect: replayed, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(again.json.data).toEqual(replayed);

    const other = await call("POST", `/referrals/${ID}/send`, {
      role: "operator",
      db: fakeDb({
        platform_send_consultant_connect: { error: { code: "55000", message: "This request was already sent to another firm." } },
        ...stepUpOk,
      }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: FIRM, confirmSend: true, code: "123456" });
    expect(other.res.status).toBe(409);
    expect(other.json.error?.message).toBe("This request was already sent to another firm.");
    expect(other.json.data).toBeUndefined();
  });

  it("does not report Sent when the function returns no lead", async () => {
    const { res, json } = await call("POST", `/referrals/${ID}/send`, {
      role: "owner",
      db: fakeDb({ platform_send_consultant_connect: { id: ID, status: "New", organization_id: null, lead_id: null, replayed: false }, ...stepUpOk }),
      userDb: fakeDb(stepUpOk),
    }, { organizationId: ORG, confirmSend: true, code: "123456" });
    expect(res.status).toBe(502);
    expect(json.error?.message).toMatch(/Nothing was marked sent/);
    expect(json.data).toBeUndefined();
  });
});

describe("referrals screen rules", () => {
  const firms = [{ id: ORG, display_name: "Fixture Licensed Firm" }];
  const open = { role: "operator" as const, organizationId: "", confirmSend: false, busy: false, online: true, codeOk: true, firms };

  it("keeps Send off until one listed firm is chosen and the confirm box is checked", () => {
    expect(canSend(open)).toBe(false);
    expect(canSend({ ...open, organizationId: ORG })).toBe(false);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true })).toBe(true);
    expect(canSend({ ...open, role: "viewer", organizationId: ORG, confirmSend: true })).toBe(false);
    expect(canSend({ ...open, role: "owner", organizationId: ORG, confirmSend: true })).toBe(true);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true, firms: [] })).toBe(false);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true, firms: null })).toBe(false);
    expect(canSend({ ...open, organizationId: FIRM, confirmSend: true })).toBe(false);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true, busy: true })).toBe(false);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true, online: false })).toBe(false);
    expect(canSend({ ...open, organizationId: ORG, confirmSend: true, codeOk: false })).toBe(false);
    expect(roleCanSend(null)).toBe(false);
  });

  it("ignores a second click while the first send is in flight", () => {
    const lock = { current: false };
    expect(claimSend(lock)).toBe(true);
    expect(claimSend(lock)).toBe(false);
    releaseSend(lock);
    expect(claimSend(lock)).toBe(true);
  });

  it("leaves the request New when Send fails, and keeps one lead on success or replay", () => {
    const failed = finishSend(request, { ok: false });
    expect(failed.close).toBe(false);
    expect(failed.row).toEqual(request);
    expect(failed.row.status).toBe("New");
    expect(failed.row.lead_id).toBeNull();

    const created = finishSend(request, { ok: true, result: sent });
    expect(created.close).toBe(true);
    expect(created.row.status).toBe("Sent");
    expect(created.row.lead_id).toBe(LEAD);
    expect(created.toast).toMatch(/One lead/);

    const replay = finishSend(request, { ok: true, result: { ...sent, replayed: true } });
    expect(replay.row.lead_id).toBe(LEAD);
    expect(replay.toast).toMatch(/same lead/);
  });

  it("drops a firm that is no longer eligible and does not select one by default", () => {
    expect(keptFirm("", firms)).toBe("");
    expect(keptFirm(ORG, firms)).toBe(ORG);
    expect(keptFirm(FIRM, firms)).toBe("");
    expect(sendBody(ORG)).toEqual({ organizationId: ORG, confirmSend: true });
    expect(sendBody(ORG, "123456")).toEqual({ organizationId: ORG, confirmSend: true, code: "123456" });
  });

  it("marks the fixture as synthetic and does not put a secret hash in it or the page", () => {
    expect(SYNTHETIC_REFERRAL.synthetic).toBe(true);
    expect(SYNTHETIC_REFERRAL.note).toMatch(/Not a live/);
    expect(SYNTHETIC_REFERRAL.request.email).toMatch(/@example\.com$/);
    expect(fixtureHasSecret(SYNTHETIC_REFERRAL)).toBe(false);
    const page = readFileSync(path.resolve(import.meta.dirname, "../src/app/referrals/page.tsx"), "utf8");
    expect(page).not.toMatch(/ip_hash|user_agent/);
    expect(page).toMatch(/Choose a firm/);
    expect(page).not.toMatch(/selected firm|default firm/i);
  });
});
