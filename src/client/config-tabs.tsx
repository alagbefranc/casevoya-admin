"use client";
import { useAdmin } from "./app";
import { Tabs } from "@/components/ui";

/** Config tabs (spec 2.8). Admins is shown to owners only. */
export function ConfigTabs({ current }: { current: "settings" | "switches" | "flags" | "admins" }) {
  const { me } = useAdmin();
  const items = [
    { key: "settings", label: "Settings", href: "/config" },
    { key: "switches", label: "Switches", href: "/config?tab=switches" },
    { key: "flags", label: "Feature flags", href: "/config?tab=flags" },
  ];
  if (me.capabilities.manageAdmins || current === "admins") items.push({ key: "admins", label: "Admins", href: "/config/admins" });
  return <Tabs current={current} items={items} />;
}
