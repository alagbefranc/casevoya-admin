#!/usr/bin/env node
// Static checks that keep the admin portal inside its boundaries. Runs in CI and before deploy.
//  1. Every exported function in a "use server" file calls `await requireAdmin()` as its first statement.
//  2. Nothing reads NEXT_PUBLIC_* (nothing about the admin worker is meant for the browser).
//  3. The service-role key is only read in src/lib/env.ts.
//  5. The admin's own session (publishable key) calls only the functions in USER_SESSION_RPCS, and the
//     service role never calls those (they read auth.uid(), aal2 and a fresh step-up themselves).
//  6. Every /api route goes through the shared handler (src/lib/api/core.ts handle), which runs the Access +
//     platform_admins gate, CSRF, role, validation, step-up and audit for every endpoint.
//  4. The portal reads only the platform-operations tables below (no client content tables) and
//     never writes tables directly: every write goes through a named, audited database function.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const READABLE = new Set([
  "organizations",
  "organization_subscriptions",
  "memberships",
  "outbox_events",
  "service_notices",
  "service_notice_targets",
  "support_access_requests",
  "support_access_uses",
  "platform_admins",
  // ADM-03 shared templates: platform-wide rows (no firm content), plus the reviewer's own licence pre-check.
  "shared_templates",
  "shared_template_versions",
  "shared_template_reviews",
  "official_source_domains",
  "consultant_credentials",
  // Config page: platform settings (no firm data).
  "product_settings",
]);

// Functions that run as the signed-in admin (their own Supabase session), never as the service role.
const USER_SESSION_RPCS = new Set([
  "approve_shared_template_version",
  "reject_shared_template_version",
  "rollback_shared_template_version",
  "record_licence_check",
  "platform_replay_outbox_event",
  "platform_admin_invite",
  "platform_admin_cancel_invite",
  "platform_admin_set_role",
  "platform_admin_set_reviewer",
  "platform_admin_remove",
  "accept_platform_admin_invite",
  "set_product_setting",
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  if (/NEXT_PUBLIC_/.test(text)) problems.push(`${rel}: uses NEXT_PUBLIC_ (the admin worker exposes nothing to the browser)`);
  if (/SUPABASE_SECRET_KEY/.test(text) && rel !== path.join("src", "lib", "env.ts")) problems.push(`${rel}: reads SUPABASE_SECRET_KEY outside src/lib/env.ts`);
  if (/^\s*["']use client["']/.test(text) && /@\/lib\/(guard|supabase|env|reviewer|session|data|api)/.test(text)) problems.push(`${rel}: a client component imports server-only admin code`);
  for (const match of text.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
    // First-admin Setup lockout counts its own failed admin_portal.setup.* rows (src/lib/setup.ts only).
    if (match[1] === "audit_log" && rel === path.join("src", "lib", "setup.ts")) continue;
    if (!READABLE.has(match[1])) problems.push(`${rel}: reads table ${match[1]}, which is not on the platform-operations allow list`);
  }
  if (/\.(insert|update|upsert|delete)\(/.test(text)) problems.push(`${rel}: writes a table directly; use a named database function (rpc) instead`);
  // 5. The admin's own session calls only USER_SESSION_RPCS; the service role (db) never calls them.
  const userCalls = [
    ...text.matchAll(/client\.rpc\(\s*["'`]([a-z_]+)["'`]/g),
    ...text.matchAll(/\brpc\(\s*(?:client|await userClient\(\))\s*,\s*["'`]([a-z_]+)["'`]/g),
  ];
  for (const match of userCalls) {
    if (!USER_SESSION_RPCS.has(match[1])) problems.push(`${rel}: the admin's own session may not call ${match[1]} (not in USER_SESSION_RPCS)`);
  }
  const serviceCalls = [...text.matchAll(/db\.rpc\(\s*["'`]([a-z_]+)["'`]/g), ...text.matchAll(/\brpc(?:<[^>]*>)?\(\s*(?:db|caller\.db)\s*,\s*["'`]([a-z_]+)["'`]/g)];
  for (const match of serviceCalls) {
    if (USER_SESSION_RPCS.has(match[1])) problems.push(`${rel}: the service role must never call ${match[1]}; it runs as the admin's own session`);
  }
  // A user-session call through a variable name we cannot see is refused (keeps rule 5 checkable).
  if (/\brpc(?:<[^>]*>)?\(\s*(?!db\b|caller\.db\b|client\b|await userClient\(\))[a-zA-Z_.]+\s*,/.test(text) && rel.startsWith(path.join("src", "lib", "api", "modules"))) {
    problems.push(`${rel}: call rpc() with db, client or await userClient() so the boundary check can see which session is used`);
  }
  // 6. API routes.
  if (rel.startsWith(path.join("src", "app", "api")) && /route\.ts$/.test(rel)) {
    if (!/from\s+["']@\/lib\/api\/core["']/.test(text) || !/\bhandle\(/.test(text)) problems.push(`${rel}: API routes must go through handle() from @/lib/api/core`);
  }
  if (/^\s*["']use server["']/.test(text)) {
    if (/export\s+(const|let|var|default|class)\s/.test(text)) problems.push(`${rel}: "use server" files may only export async functions`);
    for (const fn of text.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)) {
      const close = text.indexOf(")", fn.index + fn[0].length);
      const open = text.indexOf("{", close);
      const firstStatement = text.slice(open + 1).split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("//"));
      if (!firstStatement || !/^(const\s+\w+\s*=\s*)?await requireAdmin\(\);/.test(firstStatement)) {
        problems.push(`${rel}: server action ${fn[1]} must start with \`await requireAdmin()\``);
      }
    }
  }
}

if (problems.length) {
  console.error(`Boundary check failed (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("Boundary check passed.");
