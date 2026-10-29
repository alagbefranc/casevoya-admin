#!/usr/bin/env node
// One-time bootstrap of the first Casevoya platform admin (DATABASE.md "First platform admin":
// Francis, set up through the admin portal, 2026-10-28; admin login admin@casevoya.ca, 2026-10-29).
//
// It refuses unless ALL of these hold:
//   1. public.platform_admins is empty (it is a first-admin bootstrap, never a way to add more);
//   2. the email is on the portal's allow list (ADMIN_ALLOWED_EMAILS in wrangler.jsonc);
//   3. that email has already signed in to admin.casevoya.ca through Cloudflare Access (one-time PIN
//      plus independent MFA). This is the "Francis signs in first" step: Access records the login,
//      and this script reads it from the Access users API.
// Then it finds (or, with --commit, creates) the auth.users row for that email (confirmed, no
// password: the identity is only used to attribute admin actions) and adds the platform_admins row,
// through public.bootstrap_first_platform_admin when the main repo has applied it (audited,
// advisory-locked; see docs/main-app/bootstrap_first_platform_admin.sql), else a guarded direct insert.
//
// Dry run by default. Prints ids and decisions, never secrets.
//   node scripts/bootstrap-first-admin.mjs [--email admin@casevoya.ca] [--commit]
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and CLOUDFLARE_API_TOKEN in the environment; on the box,
//   bash scripts/with-secrets.sh node scripts/bootstrap-first-admin.mjs
import fs from "node:fs";
import path from "node:path";

const ACCOUNT_ID = "c8010438fc56280e3ea5747a123e818a";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export function allowList() {
  const text = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
  const match = text.match(/"ADMIN_ALLOWED_EMAILS"\s*:\s*"([^"]*)"/);
  return (match?.[1] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function parseArgs(argv) {
  const out = { email: "admin@casevoya.ca", commit: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") out.email = String(argv[++i] ?? "").trim().toLowerCase();
    else if (argv[i] === "--commit") out.commit = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

async function json(response, what) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${body?.message ?? body?.msg ?? body?.errors?.[0]?.message ?? ""}`.trim());
  return body;
}

async function accessLogin(email) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set (needed to confirm the Access sign-in).");
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/access/users?email=${encodeURIComponent(email)}`;
  const body = await json(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }), "Access users");
  const user = (body.result ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  return user ? { id: user.id, lastLogin: user.last_successful_login ?? null } : null;
}

async function main() {
  const { email, commit } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  const rest = (p, init = {}) => fetch(`${url}${p}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

  if (!allowList().includes(email)) throw new Error(`${email} is not on ADMIN_ALLOWED_EMAILS in wrangler.jsonc.`);

  const countRes = await rest("/rest/v1/platform_admins?select=user_id", { headers: { Prefer: "count=exact", Range: "0-0" } });
  if (!countRes.ok) throw new Error(`platform_admins count: HTTP ${countRes.status}`);
  const total = Number((countRes.headers.get("content-range") ?? "*/0").split("/")[1]);
  if (total !== 0) throw new Error(`platform_admins already has ${total} row(s). Bootstrap only runs on an empty table.`);
  console.log("platform_admins is empty.");

  const login = await accessLogin(email);
  if (!login?.lastLogin) {
    throw new Error(`${email} has not signed in to admin.casevoya.ca through Cloudflare Access yet. Sign in there first (PIN + MFA), then rerun.`);
  }
  console.log(`Access sign-in confirmed for ${email} (last login ${login.lastLogin}).`);

  let userId = null;
  for (let page = 1; page <= 20 && !userId; page += 1) {
    const body = await json(await rest(`/auth/v1/admin/users?page=${page}&per_page=200&filter=${encodeURIComponent(email)}`), "auth users");
    const users = body.users ?? [];
    userId = users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
    if (users.length < 200) break;
  }
  console.log(userId ? `auth user exists: ${userId}` : `no auth user for ${email}; ${commit ? "creating one" : "would create one (confirmed, no password)"}.`);

  if (!commit) {
    console.log("Dry run: nothing was written. Rerun with --commit to add the platform_admins row.");
    return;
  }

  if (!userId) {
    const created = await json(
      await rest("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, email_confirm: true, app_metadata: { casevoya_platform_operator: true } }),
      }),
      "create auth user",
    );
    userId = created.id ?? created.user?.id;
    if (!userId) throw new Error("create auth user returned no id");
    console.log(`created auth user ${userId}`);
  }

  const note = "first platform admin (bootstrap via casevoya-admin)";
  const rpc = await rest("/rest/v1/rpc/bootstrap_first_platform_admin", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_note: note }) });
  if (rpc.ok) {
    console.log(`platform_admins row added for ${userId} via bootstrap_first_platform_admin (audited).`);
    return;
  }
  const rpcBody = await rpc.json().catch(() => ({}));
  if (rpcBody?.code !== "PGRST202") throw new Error(`bootstrap_first_platform_admin: ${rpcBody?.message ?? rpc.status}`);
  console.log("bootstrap_first_platform_admin is not on this database yet; using a guarded direct insert.");
  // Re-check emptiness immediately before the insert.
  const again = await rest("/rest/v1/platform_admins?select=user_id", { headers: { Prefer: "count=exact", Range: "0-0" } });
  if (Number((again.headers.get("content-range") ?? "*/1").split("/")[1]) !== 0) throw new Error("platform_admins is no longer empty; stopping.");
  await json(
    await rest("/rest/v1/platform_admins", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, note, created_by: userId }) }),
    "insert platform_admins",
  );
  console.log(`platform_admins row added for ${userId}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Bootstrap refused: ${error.message}`);
    process.exit(1);
  });
}
