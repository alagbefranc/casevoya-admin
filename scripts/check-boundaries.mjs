#!/usr/bin/env node
// Static checks that keep the admin portal inside its boundaries. Runs in CI and before deploy.
//  1. Every exported function in a "use server" file calls `await requireAdmin()` as its first statement.
//  2. Nothing reads NEXT_PUBLIC_* (nothing about the admin worker is meant for the browser).
//  3. The service-role key is only read in src/lib/env.ts.
//  5. The template reviewer's own session only approves/rejects; the service role never does.
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
  if (/^\s*["']use client["']/.test(text) && /@\/lib\/(guard|supabase|env|reviewer|data)/.test(text)) problems.push(`${rel}: a client component imports server-only admin code`);
  for (const match of text.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
    if (!READABLE.has(match[1])) problems.push(`${rel}: reads table ${match[1]}, which is not on the platform-operations allow list`);
  }
  if (/\.(insert|update|upsert|delete)\(/.test(text)) problems.push(`${rel}: writes a table directly; use a named database function (rpc) instead`);
  // 5. The reviewer's own session (publishable key) is used for exactly two RPCs, and the service role never tries them.
  for (const match of text.matchAll(/client\.rpc\(\s*["'`]([a-z_]+)["'`]/g)) {
    if (!["approve_shared_template_version", "reject_shared_template_version"].includes(match[1])) {
      problems.push(`${rel}: the reviewer session may only call approve/reject_shared_template_version, not ${match[1]}`);
    }
  }
  if (/db\.rpc\(\s*["'`](approve|reject|rollback)_shared_template_version/.test(text)) {
    problems.push(`${rel}: the service role must never approve, reject or roll back a shared template`);
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
