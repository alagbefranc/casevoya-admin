import Link from "next/link";
import type { GateReason } from "@/lib/guard";

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/firms", label: "Firms" },
  { href: "/health", label: "Service health" },
  { href: "/notices", label: "Service notices" },
  { href: "/support", label: "Support access" },
  { href: "/templates", label: "Shared templates" },
];

export function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Admin">
        <div className="brand">Casevoya admin</div>
        <div className="sub">Platform operations</div>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <div className="who">Signed in as {email}</div>
      </nav>
      <main>{children}</main>
    </div>
  );
}

const EXPLAIN: Record<GateReason, string> = {
  config: "The admin Worker is missing configuration. Check its vars and secrets.",
  no_access_jwt: "This request did not come through Cloudflare Access. Open https://admin.casevoya.ca and sign in.",
  bad_access_jwt: "The Cloudflare Access sign-in could not be verified. Sign in again.",
  email_not_allowed: "This identity is not on the admin allow list.",
  no_auth_user: "Access let you in, but no Casevoya user exists for this email yet. Run the one-time bootstrap (docs/BOOTSTRAP.md).",
  not_platform_admin: "Access let you in, but this user is not a platform admin yet. Run the one-time bootstrap (docs/BOOTSTRAP.md).",
  lookup_failed: "The admin check could not reach the database. Try again.",
};

export function Denied({ reason }: { reason: GateReason }) {
  return (
    <main style={{ maxWidth: 640, margin: "60px auto" }}>
      <h1>Casevoya admin</h1>
      <div className="banner bad" role="alert">
        {EXPLAIN[reason]}
      </div>
      <p className="hint mono">reason: {reason}</p>
    </main>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <div className="banner bad" role="alert">{error}</div>;
  if (ok) return <div className="banner ok" role="status">{ok}</div>;
  return null;
}
