import {
  Activity, ArrowRightLeft, BadgeCheck, Building2, ChartColumn, CreditCard, FlaskConical, House, KeyRound, Rocket, ScrollText, Settings, ShieldCheck, Siren,
} from "lucide-react";

/** Sidebar groups, order and names from spec 1.5. */
type NavItem = { key: string; href: string; label: string; icon: typeof House };
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Operate", items: [
    { key: "overview", href: "/", label: "Overview", icon: House },
    { key: "firms", href: "/firms", label: "Firms", icon: Building2 },
    { key: "subscriptions", href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
    { key: "usage", href: "/usage", label: "Usage", icon: ChartColumn },
    { key: "verification", href: "/verification", label: "Verification", icon: BadgeCheck },
    { key: "grants", href: "/grants", label: "Grants", icon: KeyRound },
  ] },
  { group: "Platform", items: [
    { key: "health", href: "/health", label: "Health", icon: Activity },
    { key: "incidents", href: "/incidents", label: "Incidents", icon: Siren },
    { key: "releases", href: "/releases", label: "Releases", icon: Rocket },
    { key: "config", href: "/config", label: "Config", icon: Settings },
  ] },
  { group: "Records", items: [
    { key: "audit", href: "/audit", label: "Audit log", icon: ScrollText },
    { key: "privacy", href: "/privacy", label: "Privacy", icon: ShieldCheck },
    { key: "sample", href: "/sample-mode", label: "Sample mode", icon: FlaskConical },
    { key: "migration", href: "/migration", label: "Migration", icon: ArrowRightLeft },
  ] },
];

/** Exactly one highlighted item: the longest nav href that prefixes the path (avoids the kit's double highlight). */
export function activeNav(pathname: string): string {
  let best = "overview";
  let len = 0;
  for (const g of NAV) for (const i of g.items) {
    const hit = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`);
    if (hit && i.href.length > len) {
      best = i.key;
      len = i.href.length;
    }
  }
  return best;
}

