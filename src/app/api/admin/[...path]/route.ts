import { requireCaller } from "@/lib/guard";
import { handle, type ApiDeps } from "@/lib/api/core";
import { ENDPOINTS } from "@/lib/api/registry";
import { signIn, signOut, sessionStatus, stepUp, userSessionClient } from "@/lib/session";
import { supabaseSetup } from "@/lib/setup";
import { rpcAttemptStore } from "@/lib/lockout";
import { rateLimit } from "@/lib/rate-limit";
import { cloudflareInvites } from "@/lib/invites";

/**
 * /api/admin/* — the admin portal's JSON API. Every request passes the Access + platform_admins gate in
 * handle() (see src/lib/api/core.ts and docs/FRONTEND-SPEC.md). Cloudflare Access also sits in front of the
 * whole hostname, so a request without an Access session never reaches this code (it gets a 302 to sign in).
 * The first-admin Setup endpoints (/api/admin/setup*) pass the setup gate instead (Access + allow list + an empty
 * platform_admins table), see src/lib/api/modules/setup.ts. Invited admins joining (/api/admin/join*) pass the join
 * gate (Access + an open invite), see src/lib/api/modules/join.ts.
 */
export const dynamic = "force-dynamic";

const deps: ApiDeps = {
  gate: (mode, request) => requireCaller(mode, request),
  rateLimit: (name, key) => rateLimit(name, key),
  sessions: { status: sessionStatus, signIn, stepUp, signOut, client: userSessionClient },
  setup: supabaseSetup,
  attempts: rpcAttemptStore,
  invites: cloudflareInvites,
};

const run = (request: Request) => handle(request, ENDPOINTS, deps);

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
