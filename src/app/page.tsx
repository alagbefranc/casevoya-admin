import Link from "next/link";
import { connection } from "next/server";
import { Denied, NAV, Shell } from "@/components/shell";
import { gate } from "@/lib/guard";

export default async function Home() {
  await connection();
  const result = await gate();
  if (!result.ok) return <Denied reason={result.reason} />;
  return (
    <Shell email={result.admin.email}>
      <h1>Platform operations</h1>
      <p className="lede">
        Casevoya is software only. This console runs the platform: firms, delivery health, service notices and support
        access. It publishes no immigration content; each firm&apos;s own licensed members build and approve their own
        templates in the app.
      </p>
      <ul>
        {NAV.filter((item) => item.href !== "/").map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
