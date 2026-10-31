import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, errorResponse, handle, readCappedText, retryAfterSeconds, type ApiDeps } from "@/lib/api/core";
import { ApiError } from "@/lib/api/errors";
import { ENDPOINTS } from "@/lib/api/registry";
import { AdminDenied, evaluateGate, evaluateInviteeGate, evaluateSetupGate } from "@/lib/guard";
import { RATE_LIMITED_MESSAGE, gateLimits, rateLimit, type Limiter, type RateLimitBinding, type RateLimitName } from "@/lib/rate-limit";
import { SessionError, classifyAuthFailure } from "@/lib/session";
import { ApiFailure, RATE_LIMITED_TEXT, apiRequest, describe as describeError } from "@/client/api";
import { ID, ME, ORG, ORIGIN, auditCalls, deps, env, fakeDb, req } from "./api-helpers";

type Body = { data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } };
const body = (res: Response) => res.json() as Promise<Body>;

/** A fake Workers Rate Limiting binding: `limit` requests per key, counted per binding. */
function fakeBinding(limit: number): RateLimitBinding & { keys: string[] } {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= limit };
    },
  };
}

/** A limiter that records calls and refuses the named bindings. */
function recordingLimiter(refuse: RateLimitName[] = []): Limiter & { calls: string[] } {
  const calls: string[] = [];
  const limiter = (async (name: RateLimitName, key: string) => {
    calls.push(`${name}:${key}`);
    return !refuse.includes(name);
  }) as Limiter & { calls: string[] };
  limiter.calls = calls;
  return limiter;
}

const identity = { email: "admin@casevoya.ca", subject: "sub-1", expiresAt: 0 };
const okVerify = async () => identity;

// ------------------------------------------------------------------------------------------------ helper

describe("rateLimit helper", () => {
  it("allows when there is no Cloudflare context or binding (tests, next dev)", async () => {
    expect(await rateLimit("ADMIN_API_READ", "k")).toBe(true);
    expect(await rateLimit("ADMIN_API_READ", "k", () => undefined)).toBe(true);
    expect(
      await rateLimit("ADMIN_API_READ", "k", () => {
        throw new Error("no context");
      }),
    ).toBe(true);
  });

  it("refuses when the binding says so, and counts per key", async () => {
    const binding = fakeBinding(2);
    const lookup = () => binding;
    expect(await rateLimit("ADMIN_API_WRITE", "sub-a", lookup)).toBe(true);
    expect(await rateLimit("ADMIN_API_WRITE", "sub-a", lookup)).toBe(true);
    expect(await rateLimit("ADMIN_API_WRITE", "sub-a", lookup)).toBe(false);
    expect(await rateLimit("ADMIN_API_WRITE", "sub-b", lookup)).toBe(true);
    expect(binding.keys).toEqual(["sub-a", "sub-a", "sub-a", "sub-b"]);
  });

  it("fails open when the binding throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimitBinding = {
      limit: async () => {
        throw new Error("binding down");
      },
    };
    expect(await rateLimit("ADMIN_SENSITIVE", "k", () => broken)).toBe(true);
    spy.mockRestore();
  });

  it("chooses read or write by method, keyed on the Access subject (email fallback), plus Setup by email", () => {
    expect(gateLimits("GET", "/firms", identity)).toEqual([["ADMIN_API_READ", "sub-1"]]);
    expect(gateLimits("HEAD", "/firms", identity)).toEqual([["ADMIN_API_READ", "sub-1"]]);
    expect(gateLimits("POST", "/notices", identity)).toEqual([["ADMIN_API_WRITE", "sub-1"]]);
    expect(gateLimits("PATCH", "/notices", { ...identity, subject: "" })).toEqual([["ADMIN_API_WRITE", "admin@casevoya.ca"]]);
    expect(gateLimits("POST", "/setup/account", identity)).toEqual([
      ["ADMIN_API_WRITE", "sub-1"],
      ["ADMIN_SETUP", "admin@casevoya.ca"],
    ]);
    expect(gateLimits("GET", "/setup", identity)).toContainEqual(["ADMIN_SETUP", "admin@casevoya.ca"]);
    expect(gateLimits("GET", "/setupx", identity)).toEqual([["ADMIN_API_READ", "sub-1"]]);
  });
});

// ------------------------------------------------------------------------------------------------ RL-1 gate

describe("RL-1: the gate throttles after the Access JWT and before any lookup", () => {
  it("refuses with rate_limited before the Auth and platform_admins lookups", async () => {
    const limiter = recordingLimiter(["ADMIN_API_WRITE"]);
    let looked = false;
    let client = false;
    const err = await evaluateGate({
      token: "t",
      env,
      verify: okVerify,
      lookupUser: async () => {
        looked = true;
        return ME;
      },
      adminRecord: async () => {
        looked = true;
        return { role: "owner", templateReviewer: false };
      },
      makeClient: () => {
        client = true;
        return {} as never;
      },
      request: { method: "POST", path: "/notices" },
      limiter,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminDenied);
    expect(err.reason).toBe("rate_limited");
    expect(err.details).toEqual({ retryAfterSeconds: 60 });
    expect(looked).toBe(false);
    expect(client).toBe(false);
    expect(limiter.calls).toEqual(["ADMIN_API_WRITE:sub-1"]);
  });

  it("lets the request through when allowed, and does not throttle without a request (pages)", async () => {
    const limiter = recordingLimiter();
    const base = { token: "t", env, verify: okVerify, lookupUser: async () => ME, adminRecord: async () => ({ role: "owner" as const, templateReviewer: false }), makeClient: () => ({}) as never, limiter };
    expect((await evaluateGate({ ...base, request: { method: "GET", path: "/firms" } })).userId).toBe(ME);
    expect(limiter.calls).toEqual(["ADMIN_API_READ:sub-1"]);
    await evaluateGate(base);
    expect(limiter.calls).toHaveLength(1);
    await evaluateInviteeGate({ ...base, request: { method: "POST", path: "/session/sign-in" } });
    expect(limiter.calls).toEqual(["ADMIN_API_READ:sub-1", "ADMIN_API_WRITE:sub-1"]);
  });

  it("does not throttle before the Access JWT verified", async () => {
    const limiter = recordingLimiter(["ADMIN_API_READ"]);
    const err = await evaluateGate({ token: null, env, request: { method: "GET", path: "/firms" }, limiter }).catch((e) => e);
    expect(err.reason).toBe("no_access_jwt");
    expect(limiter.calls).toEqual([]);
  });

  it("applies ADMIN_SETUP keyed on the email to the Setup gate, before counting admins", async () => {
    const limiter = recordingLimiter(["ADMIN_SETUP"]);
    let counted = false;
    const err = await evaluateSetupGate({
      token: "t",
      env,
      verify: okVerify,
      makeClient: () => ({}) as never,
      countAdmins: async () => {
        counted = true;
        return { count: 0, firstAt: null };
      },
      request: { method: "POST", path: "/setup/account" },
      limiter,
    }).catch((e) => e);
    expect(err.reason).toBe("rate_limited");
    expect(counted).toBe(false);
    expect(limiter.calls).toEqual(["ADMIN_API_WRITE:sub-1", "ADMIN_SETUP:admin@casevoya.ca"]);
  });

  it("answers 429 with Retry-After and no database call or audit row", async () => {
    const db = fakeDb();
    const limiter = recordingLimiter(["ADMIN_API_WRITE"]);
    const seen: unknown[] = [];
    const d: ApiDeps = {
      ...deps({ db }),
      gate: (mode, request) => {
        seen.push({ mode, request });
        return evaluateGate({ token: "t", env, verify: okVerify, lookupUser: async () => ME, adminRecord: async () => ({ role: "owner", templateReviewer: false }), makeClient: () => db as never, request, limiter });
      },
    };
    const res = await handle(req("POST", "/notices", { kind: "info", title: "Heads up", body: "New feature", audience: "all", publish: false }), ENDPOINTS, d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const err = (await body(res)).error;
    expect(err?.code).toBe("rate_limited");
    expect(err?.message).toBe(RATE_LIMITED_MESSAGE);
    expect(db.calls).toEqual([]);
    expect(seen).toEqual([{ mode: "admin", request: { method: "POST", path: "/notices" } }]);
  });

  it("still serves the request when the limiter allows it", async () => {
    const db = fakeDb({ platform_admin_list: { admins: [] } });
    const limiter = recordingLimiter();
    const d: ApiDeps = {
      ...deps({ db }),
      gate: (_mode, request) => evaluateInviteeGate({ token: "t", env, verify: okVerify, lookupUser: async () => ME, adminRecord: async () => ({ role: "owner", templateReviewer: false }), makeClient: () => db as never, request, limiter }),
    };
    const res = await handle(req("GET", "/session"), ENDPOINTS, d);
    expect(res.status).toBe(200);
    expect(limiter.calls).toEqual(["ADMIN_API_READ:sub-1"]);
  });
});

// ------------------------------------------------------------------------------------------------ sensitive

describe("ADMIN_SENSITIVE: support requests and real CICC imports", () => {
  const supportBody = { organizationId: ORG, scope: "firm_settings", requesterName: "Ops", reason: "Billing settings help", confirmFirmNotified: true };
  const csv = "Licence Number,Name,Status\nR500001,Test Person,Active\n";
  const importBody = (dryRun: boolean) => ({ sourceNote: "Downloaded from CICC", fileName: "list.csv", csv, dryRun });

  it("refuses a support request once the sensitive limit is reached, before the database function", async () => {
    const limiter = recordingLimiter(["ADMIN_SENSITIVE"]);
    const d = { ...deps({ db: fakeDb({ create_support_access_request: ID }) }), rateLimit: limiter };
    const res = await handle(req("POST", "/support/requests", supportBody), ENDPOINTS, d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await body(res)).error?.code).toBe("rate_limited");
    expect(d.db.calls.map((c) => c.fn)).not.toContain("create_support_access_request");
    expect(auditCalls(d.db)[0].args).toMatchObject({ p_action: "admin_portal.support.request_created", p_result: "denied" });
    expect(limiter.calls).toEqual(["ADMIN_SENSITIVE:s"]);
  });

  it("creates the support request while under the limit", async () => {
    const limiter = recordingLimiter();
    const d = { ...deps({ session: "fresh", db: fakeDb({ create_support_access_request: ID }), userDb: fakeDb({ platform_step_up_check: { ok: true, user_id: ME } }) }), rateLimit: limiter };
    expect((await handle(req("POST", "/support/requests", supportBody), ENDPOINTS, d)).status).toBe(201);
    expect(limiter.calls).toHaveLength(1);
  });

  it("limits real CICC imports but not dry runs", async () => {
    const limiter = recordingLimiter(["ADMIN_SENSITIVE"]);
    const dry = { ...deps({ role: "operator" }), rateLimit: limiter };
    expect((await handle(req("POST", "/licences/cicc-imports", importBody(true)), ENDPOINTS, dry)).status).toBe(200);
    expect(limiter.calls).toEqual([]);

    const real = { ...deps({ role: "operator", session: "fresh", db: fakeDb({ start_cicc_register_import: ID }) }), rateLimit: limiter };
    const res = await handle(req("POST", "/licences/cicc-imports", importBody(false)), ENDPOINTS, real);
    expect(res.status).toBe(429);
    expect(real.db.calls.map((c) => c.fn)).not.toContain("start_cicc_register_import");
  });
});

// ------------------------------------------------------------------------------------------------ RL-3 body cap

function streamOf(size: number, chunk = 16 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) return controller.close();
      const n = Math.min(chunk, size - sent);
      controller.enqueue(new Uint8Array(n).fill(0x20));
      sent += n;
    },
  });
}

describe("RL-3: request body cap", () => {
  const notice = { kind: "info", title: "Heads up", body: "New feature", audience: "all", publish: false };

  it("refuses a body over 64 KB with 413 before the handler runs", async () => {
    const d = deps({ db: fakeDb({ post_service_notice: ID }) });
    const res = await handle(req("POST", "/notices", { ...notice, padding: "x".repeat(MAX_BODY_BYTES) }), ENDPOINTS, d);
    expect(res.status).toBe(413);
    expect((await body(res)).error?.code).toBe("payload_too_large");
    expect(d.db.calls.map((c) => c.fn)).not.toContain("post_service_notice");
  });

  it("counts the streamed bytes when there is no content-length", async () => {
    const d = deps({ db: fakeDb({ post_service_notice: ID }) });
    const request = new Request(`${ORIGIN}/api/admin/notices`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: streamOf(MAX_BODY_BYTES + 1), duplex: "half" } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const res = await handle(request, ENDPOINTS, d);
    expect(res.status).toBe(413);
    expect(d.db.calls.map((c) => c.fn)).not.toContain("post_service_notice");
  });

  it("reads exactly up to the cap, refuses past it, and decodes UTF-8", async () => {
    const at = new Request(`${ORIGIN}/x`, { method: "POST", body: streamOf(100), duplex: "half" } as RequestInit);
    expect((await readCappedText(at, 100))?.length).toBe(100);
    const over = new Request(`${ORIGIN}/x`, { method: "POST", body: streamOf(101), duplex: "half" } as RequestInit);
    expect(await readCappedText(over, 100)).toBeNull();
    const declared = new Request(`${ORIGIN}/x`, { method: "POST", body: "{}", headers: { "content-length": "999999" } });
    expect(await readCappedText(declared, 100)).toBeNull();
    const text = new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify({ note: "Montréal ✓" }) });
    expect(JSON.parse((await readCappedText(text, 100)) ?? "")).toEqual({ note: "Montréal ✓" });
  });

  it("accepts a CICC upload larger than 64 KB (the import endpoint allows 10 MB)", async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `R5${String(i).padStart(5, "0")},Test Person ${i},Active`).join("\n");
    const csv = `Licence Number,Name,Status\n${rows}\n`;
    expect(csv.length).toBeGreaterThan(MAX_BODY_BYTES);
    const d = deps({ role: "operator" });
    const res = await handle(req("POST", "/licences/cicc-imports", { sourceNote: "Downloaded from CICC", fileName: "list.csv", csv, dryRun: true }), ENDPOINTS, d);
    expect(res.status).toBe(200);
  });
});

// ------------------------------------------------------------------------------------------------ RL-7 Retry-After

describe("RL-7: every 429 carries Retry-After", () => {
  it("sets it from retryAfterSeconds on the attempt lockout", async () => {
    const d = deps({ session: "fresh", badAttempts: 5 });
    const res = await handle(req("POST", "/session/step-up", { code: "123456" }), ENDPOINTS, d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("900");
  });

  it("sets it on a gate refusal", async () => {
    const d = deps({ denied: new AdminDenied("rate_limited", RATE_LIMITED_MESSAGE, { retryAfterSeconds: 60 }) });
    const res = await handle(req("GET", "/firms"), ENDPOINTS, d);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(d.db.calls).toEqual([]);
  });

  it("derives the wait from seconds, else minutes (Setup lockout), else the throttle period", () => {
    expect(retryAfterSeconds(new ApiError("rate_limited", "x", { retryAfterSeconds: 420 }))).toBe(420);
    expect(retryAfterSeconds(new ApiError("rate_limited", "x", { retryAfterMinutes: 15 }))).toBe(900);
    expect(retryAfterSeconds(new ApiError("rate_limited", "x"))).toBe(60);
    expect(errorResponse(new ApiError("rate_limited", "x", { retryAfterMinutes: 15 }), "r").headers.get("retry-after")).toBe("900");
  });

  it("does not set it on other errors", async () => {
    const d = deps({ role: "viewer" });
    const res = await handle(req("POST", "/notices", { kind: "info", title: "Heads up", body: "New feature", audience: "all", publish: false }), ENDPOINTS, d);
    expect(res.status).toBe(403);
    expect(res.headers.get("retry-after")).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ RL-7 Auth errors

describe("RL-7: Supabase Auth failures that are not a wrong secret are not counted", () => {
  it("classifies only clear refusals as invalid", () => {
    expect(classifyAuthFailure({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }, "password")).toBe("invalid");
    expect(classifyAuthFailure({ status: 400, message: "Invalid login credentials" }, "password")).toBe("invalid");
    expect(classifyAuthFailure({ status: 422, code: "mfa_verification_failed", message: "Invalid TOTP code entered" }, "code")).toBe("invalid");
    for (const e of [{ status: 429, code: "over_request_rate_limit" }, { status: 500 }, { status: 503 }, { status: 0 }, { name: "AuthRetryableFetchError", status: 502 }, {}]) {
      expect(classifyAuthFailure(e, "password"), JSON.stringify(e)).toBe("unavailable");
      expect(classifyAuthFailure(e, "code"), JSON.stringify(e)).toBe("unavailable");
    }
    expect(classifyAuthFailure({ status: 400, code: "email_not_confirmed" }, "password")).toBe("refused");
  });

  function signInDeps(error: SessionError) {
    const d = deps({ badAttempts: 0 });
    d.sessions.signIn = async () => {
      throw error;
    };
    return d;
  }

  it("does not count an unavailable sign-in as a bad attempt", async () => {
    const d = signInDeps(new SessionError("unavailable", "Casevoya sign-in did not answer."));
    const res = await handle(req("POST", "/session/sign-in", { password: "pw", code: "123456" }), ENDPOINTS, d);
    expect(res.status).toBe(502);
    expect(d.attemptCalls).toEqual(["reserve:password", "resolve:true"]);
    expect(auditCalls(d.db)[0].args.p_context).not.toHaveProperty("bad_attempt");
  });

  it("still counts a wrong password", async () => {
    const d = signInDeps(new SessionError("bad_credentials", "Email or password was not accepted."));
    const res = await handle(req("POST", "/session/sign-in", { password: "pw", code: "123456" }), ENDPOINTS, d);
    expect(res.status).toBe(422);
    expect(d.attemptCalls).toEqual(["reserve:password", "resolve:false"]);
  });
});

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() },
};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}));

describe("RL-7: session sign-in maps Supabase Auth errors", () => {
  const who = { env, email: "admin@casevoya.ca", userId: ME };
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.signInWithPassword.mockReset();
    auth.mfa.listFactors.mockReset().mockResolvedValue({ data: { totp: [{ id: "f1", status: "verified" }] }, error: null });
    auth.mfa.challengeAndVerify.mockReset();
  });
  afterEach(() => spy.mockRestore());

  const kindOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof SessionError ? e.kind : String(e)));

  it("wrong password: bad_credentials; Auth busy or down: unavailable", async () => {
    const { signIn } = await import("@/lib/session");
    auth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } });
    expect(await kindOf(signIn(who, "pw", "123456"))).toBe("bad_credentials");
    auth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" } });
    expect(await kindOf(signIn(who, "pw", "123456"))).toBe("unavailable");
    auth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" } });
    expect(await kindOf(signIn(who, "pw", "123456"))).toBe("unavailable");
  });

  it("wrong code: bad_code; Auth server error on the code: unavailable", async () => {
    const { signIn } = await import("@/lib/session");
    auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "a", refresh_token: "r" }, user: { id: ME } }, error: null });
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { status: 422, code: "mfa_verification_failed", message: "Invalid TOTP code entered" } });
    expect(await kindOf(signIn(who, "pw", "123456"))).toBe("bad_code");
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { status: 500, message: "internal" } });
    expect(await kindOf(signIn(who, "pw", "123456"))).toBe("unavailable");
  });

  it("never logs the password or code", async () => {
    const { signIn } = await import("@/lib/session");
    auth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 503, message: "down" } });
    await kindOf(signIn(who, "secret-password-value", "654321"));
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret-password-value|654321/);
  });
});

// ------------------------------------------------------------------------------------------------ client

describe("client: rate-limited messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the friendly throttle message for rate_limited / 429", () => {
    const d = describeError(new ApiFailure("rate_limited", RATE_LIMITED_MESSAGE, 429, "req-1", { retryAfterSeconds: 60 }));
    expect(`${d.title}. ${d.body}`).toBe(RATE_LIMITED_TEXT);
    expect(describeError(new ApiFailure("internal", "x", 429, null)).title).toBe("Too many requests");
  });

  it("keeps the lockout's own wait time", () => {
    const d = describeError(new ApiFailure("rate_limited", "Too many wrong codes or passwords. Wait 15 minutes, then try again.", 429, null, { retryAfterMinutes: 15 }));
    expect(d.title).toMatch(/15 minutes/);
  });

  it("maps a non-JSON 429 to rate_limited instead of a sign-in failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Too many requests", { status: 429, headers: { "content-type": "text/plain" } })));
    const err = (await apiRequest("GET", "/firms").catch((e: unknown) => e)) as ApiFailure;
    expect(err).toBeInstanceOf(ApiFailure);
    expect(err.code).toBe("rate_limited");
    expect(err.message).toBe(RATE_LIMITED_TEXT);
  });
});
