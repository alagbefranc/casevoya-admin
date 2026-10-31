import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessJwt } from "@/lib/access";
import { evaluateGate, AdminDenied } from "@/lib/guard";
import type { AdminEnv } from "@/lib/env";
import { parseEmails, readEnv } from "@/lib/env";

const team = "example-team.cloudflareaccess.com";
const aud = "aud-123";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? `https://${team}`)
      .setAudience(opts.aud ?? aud)
      .setSubject("sub-1")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "10m")
      .sign(privateKey);
  return { jwks, sign };
}

const env: AdminEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseSecretKey: "test-only",
  accessTeamDomain: team,
  accessAud: aud,
  allowedEmails: ["admin@casevoya.ca"],
  supabasePublishableKey: null,
  adminOrigin: "https://admin.casevoya.ca",
  invites: null,
};

describe("verifyAccessJwt", () => {
  it("accepts a valid token for an allowed email (case-insensitive)", async () => {
    const { jwks, sign } = await setup();
    const id = await verifyAccessJwt(await sign({ email: "Admin@Casevoya.ca" }), { teamDomain: team, aud, allowedEmails: env.allowedEmails, jwks });
    expect(id.email).toBe("admin@casevoya.ca");
  });
  it("refuses a missing token", async () => {
    await expect(verifyAccessJwt(null, { teamDomain: team, aud, allowedEmails: env.allowedEmails })).rejects.toMatchObject({ reason: "no_access_jwt" });
  });
  it("refuses the wrong audience, issuer, or an expired token", async () => {
    const { jwks, sign } = await setup();
    const o = { teamDomain: team, aud, allowedEmails: env.allowedEmails, jwks };
    await expect(verifyAccessJwt(await sign({ email: "admin@casevoya.ca" }, { aud: "other" }), o)).rejects.toMatchObject({ reason: "bad_access_jwt" });
    await expect(verifyAccessJwt(await sign({ email: "admin@casevoya.ca" }, { iss: "https://evil.cloudflareaccess.com" }), o)).rejects.toMatchObject({ reason: "bad_access_jwt" });
    await expect(verifyAccessJwt(await sign({ email: "admin@casevoya.ca" }, { exp: "-5m" }), o)).rejects.toMatchObject({ reason: "bad_access_jwt" });
  });
  it("refuses a token signed by another key", async () => {
    const a = await setup();
    const b = await setup();
    await expect(verifyAccessJwt(await b.sign({ email: "admin@casevoya.ca" }), { teamDomain: team, aud, allowedEmails: env.allowedEmails, jwks: a.jwks })).rejects.toMatchObject({ reason: "bad_access_jwt" });
  });
  it("refuses an email that is not on the allow list", async () => {
    const { jwks, sign } = await setup();
    await expect(verifyAccessJwt(await sign({ email: "someone@casevoya.ca" }), { teamDomain: team, aud, allowedEmails: env.allowedEmails, jwks })).rejects.toMatchObject({ reason: "email_not_allowed" });
  });
});

describe("evaluateGate", () => {
  const okVerify = async () => ({ email: "admin@casevoya.ca", subject: "s", expiresAt: 0 });
  const fakeClient = () => ({}) as never;

  it("passes only when Access verifies and a platform_admins row exists", async () => {
    const ctx = await evaluateGate({ token: "t", env, verify: okVerify, lookupUser: async () => "u1", adminRecord: async () => ({ role: "owner", templateReviewer: false }), makeClient: fakeClient });
    expect(ctx.userId).toBe("u1");
    expect(ctx.role).toBe("owner");
  });
  it("refuses when there is no auth user (before bootstrap)", async () => {
    await expect(evaluateGate({ token: "t", env, verify: okVerify, lookupUser: async () => null, makeClient: fakeClient })).rejects.toMatchObject({ reason: "no_auth_user" });
  });
  it("refuses when there is no platform_admins row", async () => {
    await expect(
      evaluateGate({ token: "t", env, verify: okVerify, lookupUser: async () => "u1", adminRecord: async () => null, makeClient: fakeClient }),
    ).rejects.toMatchObject({ reason: "not_platform_admin" });
  });
  it("never looks up the database when Access refuses", async () => {
    let looked = false;
    const err = await evaluateGate({ token: null, env, lookupUser: async () => { looked = true; return "u1"; } }).catch((e) => e);
    expect(err).toBeInstanceOf(AdminDenied);
    expect(err.reason).toBe("no_access_jwt");
    expect(looked).toBe(false);
  });
});

describe("env", () => {
  it("parses and dedupes the allow list", () => {
    expect(parseEmails(" Admin@casevoya.ca, admin@casevoya.ca ,bad")).toEqual(["admin@casevoya.ca"]);
  });
  it("names missing settings without printing values", () => {
    expect(() => readEnv({ SUPABASE_URL: "https://x.supabase.co" })).toThrow(/SUPABASE_SECRET_KEY, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, ADMIN_ALLOWED_EMAILS/);
  });
});
