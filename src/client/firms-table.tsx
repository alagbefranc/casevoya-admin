"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Building2 } from "lucide-react";
import { withQuery } from "@/client/api";
import { useApi, useQueryState } from "@/client/hooks";
import { day, num, words } from "@/client/format";
import type { FirmRow, Page } from "@/client/types";
import { Badge, DataTable, Empty, FilterBar, FilteredEmpty, PageHeader, Pager, Panel, SampleBadge, SearchField, Section, SelectField, SkeletonRows, Status, exceptionTone, opts, statusLabel } from "@/components/ui";

const VERIFICATION = ["unverified", "pending_review", "verified", "restricted"] as const;
const SUBSCRIPTION = ["trial", "trial_ended", "active", "cancelled", "past_due", "restricted", "archived", "none", "exception"] as const;
const PLANS = ["solo", "practice", "firm", "enterprise"] as const;
const SORTS = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];
const LIMIT = 50;

export function FirmsTable({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const search = q.get("search") ?? "";
  const verification = q.get("verification") ?? "";
  const subscription = q.get("subscription") ?? "";
  const plan = q.get("plan") ?? "";
  const sample = q.get("sample") ?? "";
  const sort = q.get("sort") ?? "created_desc";
  const offset = Number(q.get("offset") ?? 0) || 0;
  const filtered = Boolean(search || verification || subscription || plan || sample);
  const firms = useApi<Page<FirmRow>>(withQuery("/firms", { search, verification, subscription, plan, sample, sort: sort === "created_desc" ? "" : sort, limit: LIMIT, offset }));
  const onSearch = useCallback((v: string) => setQ({ search: v }), [setQ]);
  const clear = () => setQ({ search: null, verification: null, subscription: null, plan: null, sample: null });

  return (
    <>
      {embedded ? null : <PageHeader title="Firms" lede="Every firm on Casevoya. Read-only: support works through grants, never by signing in as a firm." />}
      <FilterBar active={[verification, subscription, plan, sample].filter(Boolean).length}>
        <SearchField id="f-search" label="Search" placeholder="Search firm name, legal name, slug or id" value={search} onChange={onSearch} />
        <SelectField id="f-ver" label="Verification" value={verification} onChange={(v) => setQ({ verification: v })} options={opts(VERIFICATION)} />
        <SelectField id="f-sub" label="Subscription" value={subscription} onChange={(v) => setQ({ subscription: v })} options={opts(SUBSCRIPTION).map((o) => (o.value === "exception" ? { ...o, label: "Any exception" } : o.value === "none" ? { ...o, label: "No subscription" } : o))} />
        <SelectField id="f-plan" label="Plan" value={plan} onChange={(v) => setQ({ plan: v })} options={opts(PLANS)} />
        <SelectField id="f-sample" label="Sample" value={sample} onChange={(v) => setQ({ sample: v })} options={[{ value: "false", label: "Live only" }, { value: "true", label: "Sample only" }]} />
        <SelectField id="f-sort" label="Sort" value={sort} all={null} onChange={(v) => setQ({ sort: v === "created_desc" ? null : v })} options={SORTS} />
      </FilterBar>
      <Panel title="Firms" icon={<Building2 className="ic" aria-hidden />} right={firms.data ? `${num(firms.data.total)} ${firms.data.total === 1 ? "firm" : "firms"}` : null}>
        <Section loaded={firms} skeleton={<SkeletonRows n={6} />}>
          {(page) => (
            <>
              <DataTable
                caption="Firms"
                rows={page.items}
                rowKey={(f) => f.id}
                onRowClick={(f) => router.push(`/firms/${f.id}`)}
                empty={filtered ? <FilteredEmpty onClear={clear} /> : <Empty title="No firms yet.">Firms appear here when they sign up in Casevoya.</Empty>}
                columns={[
                  { key: "firm", label: "Firm", first: true, render: (f) => (<><b><Link href={`/firms/${f.id}`}>{f.display_name}</Link></b> <SampleBadge on={f.sample_mode} />{f.legal_name ? <small>{f.legal_name}</small> : null}</>) },
                  { key: "plan", label: "Plan", render: (f) => (f.plan ? words(f.plan) : "—") },
                  { key: "ver", label: "Verification", render: (f) => <Status value={f.verification_status} /> },
                  { key: "sub", label: "Subscription", render: (f) => (
                    <span className="badges" style={{ flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                      {f.subscription_status ? <Status value={f.subscription_status} /> : <Badge>No subscription</Badge>}
                      {(f.exception_reasons ?? []).map((r) => <Badge key={r} tone={exceptionTone(r)}>{statusLabel(r)}</Badge>)}
                    </span>
                  ) },
                  { key: "mem", label: "Members", render: (f) => num(f.active_members) },
                  { key: "created", label: "Created", render: (f) => day(f.created_at) },
                ]}
              />
              <Pager total={page.total} limit={LIMIT} offset={offset} onOffset={(o) => setQ({ offset: o ? String(o) : null })} />
            </>
          )}
        </Section>
      </Panel>
    </>
  );
}
