import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Cloudflare Access sits in front of admin.casevoya.ca and adds a signed JWT to every request it
 * lets through (Cf-Access-Jwt-Assertion). We verify it ourselves on every page and every server
 * action, so a request that reaches the Worker some other way (a misconfigured route, a removed
 * Access app) is still refused.
 */
export const ACCESS_HEADER = "cf-access-jwt-assertion";

const jwksCache = new Map<string, JWTVerifyGetKey>();

export function accessJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export type AccessIdentity = { email: string; subject: string; expiresAt: number };

export class AccessDenied extends Error {
  constructor(
    readonly reason: "no_access_jwt" | "bad_access_jwt" | "email_not_allowed",
    message: string,
  ) {
    super(message);
  }
}

export async function verifyAccessJwt(
  token: string | null | undefined,
  opts: {
    teamDomain: string;
    aud: string;
    allowedEmails: string[];
    jwks?: JWTVerifyGetKey;
    /**
     * For an email not on the static list: whether the portal itself admits it (a platform admin or an open
     * invite, see guard.ts). Access only lets such an email through because the portal added it to the policy.
     */
    isAllowed?: (email: string) => Promise<boolean>;
  },
): Promise<AccessIdentity> {
  if (!token) throw new AccessDenied("no_access_jwt", "No Cloudflare Access token on the request");
  let payload;
  try {
    ({ payload } = await jwtVerify(token, opts.jwks ?? accessJwks(opts.teamDomain), {
      issuer: `https://${opts.teamDomain}`,
      audience: opts.aud,
      algorithms: ["RS256"],
      clockTolerance: 30,
    }));
  } catch {
    throw new AccessDenied("bad_access_jwt", "The Cloudflare Access token did not verify");
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !(opts.allowedEmails.includes(email) || (opts.isAllowed ? await opts.isAllowed(email) : false))) {
    throw new AccessDenied("email_not_allowed", "This identity is not on the admin allow list");
  }
  return { email, subject: String(payload.sub ?? ""), expiresAt: Number(payload.exp ?? 0) };
}
