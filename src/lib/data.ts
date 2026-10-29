import "server-only";
import type { AdminContext } from "./guard";

/** Read helpers. Each takes a context that has already passed requireAdmin(). Metadata only. */

export type FirmRow = {
  id: string;
  name: string;
  legalName: string;
  slug: string;
  verification: string;
  sample: boolean;
  createdAt: string;
  subscription: string | null;
  plan: string | null;
  trialEndsAt: string | null;
  activeSeats: number;
};

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export async function firmNames(admin: AdminContext): Promise<Map<string, string>> {
  const { data, error } = await admin.db.from("organizations").select("id, display_name").limit(1000);
  if (error) fail("organizations", error);
  return new Map((data ?? []).map((row) => [row.id as string, row.display_name as string]));
}

export async function listFirms(admin: AdminContext): Promise<FirmRow[]> {
  const [orgs, subs, members] = await Promise.all([
    admin.db
      .from("organizations")
      .select("id, display_name, legal_name, slug, verification_status, sample_mode, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    admin.db.from("organization_subscriptions").select("organization_id, status, plan, trial_ends_at").limit(1000),
    admin.db.from("memberships").select("organization_id").eq("status", "active").limit(10000),
  ]);
  if (orgs.error) fail("organizations", orgs.error);
  if (subs.error) fail("organization_subscriptions", subs.error);
  if (members.error) fail("memberships", members.error);
  const subBy = new Map((subs.data ?? []).map((row) => [row.organization_id as string, row]));
  const seats = new Map<string, number>();
  for (const row of members.data ?? []) seats.set(row.organization_id as string, (seats.get(row.organization_id as string) ?? 0) + 1);
  return (orgs.data ?? []).map((org) => {
    const sub = subBy.get(org.id as string);
    return {
      id: org.id as string,
      name: org.display_name as string,
      legalName: org.legal_name as string,
      slug: org.slug as string,
      verification: String(org.verification_status),
      sample: Boolean(org.sample_mode),
      createdAt: org.created_at as string,
      subscription: sub ? String(sub.status) : null,
      plan: sub?.plan ? String(sub.plan) : null,
      trialEndsAt: (sub?.trial_ends_at as string | null) ?? null,
      activeSeats: seats.get(org.id as string) ?? 0,
    };
  });
}

export const OUTBOX_STATUSES = ["pending", "processing", "published", "failed", "dead_lettered"] as const;

export async function outboxCounts(admin: AdminContext): Promise<Record<(typeof OUTBOX_STATUSES)[number], number>> {
  const results = await Promise.all(
    OUTBOX_STATUSES.map((status) => admin.db.from("outbox_events").select("id", { count: "exact", head: true }).eq("status", status)),
  );
  const out = {} as Record<(typeof OUTBOX_STATUSES)[number], number>;
  results.forEach((result, i) => {
    if (result.error) fail("outbox_events", result.error);
    out[OUTBOX_STATUSES[i]] = result.count ?? 0;
  });
  return out;
}

export type DeadLetter = {
  id: string;
  organizationId: string;
  aggregateType: string;
  eventType: string;
  attempts: number;
  lastError: string | null;
  occurredAt: string;
  availableAt: string;
};

/** Dead-lettered events: metadata and the truncated last error only. Never the payload. */
export async function deadLetters(admin: AdminContext): Promise<DeadLetter[]> {
  const { data, error } = await admin.db
    .from("outbox_events")
    .select("id, organization_id, aggregate_type, event_type, attempts, last_error, occurred_at, available_at")
    .eq("status", "dead_lettered")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) fail("outbox_events", error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    aggregateType: row.aggregate_type as string,
    eventType: row.event_type as string,
    attempts: Number(row.attempts),
    lastError: row.last_error ? String(row.last_error).slice(0, 400) : null,
    occurredAt: row.occurred_at as string,
    availableAt: row.available_at as string,
  }));
}

export async function oldestPending(admin: AdminContext): Promise<string | null> {
  const { data, error } = await admin.db
    .from("outbox_events")
    .select("occurred_at")
    .eq("status", "pending")
    .order("occurred_at", { ascending: true })
    .limit(1);
  if (error) fail("outbox_events", error);
  return (data?.[0]?.occurred_at as string | undefined) ?? null;
}

export type Notice = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  status: string;
  audience: string;
  startsAt: string;
  endsAt: string | null;
  publishedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  firmIds: string[];
};

export async function listNotices(admin: AdminContext): Promise<Notice[]> {
  const [notices, targets] = await Promise.all([
    admin.db
      .from("service_notices")
      .select("id, kind, severity, title, body, status, audience, starts_at, ends_at, published_at, resolved_at, resolution_note, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.db.from("service_notice_targets").select("notice_id, organization_id").limit(5000),
  ]);
  if (notices.error) fail("service_notices", notices.error);
  if (targets.error) fail("service_notice_targets", targets.error);
  const byNotice = new Map<string, string[]>();
  for (const t of targets.data ?? []) byNotice.set(t.notice_id as string, [...(byNotice.get(t.notice_id as string) ?? []), t.organization_id as string]);
  return (notices.data ?? []).map((n) => ({
    id: n.id as string,
    kind: n.kind as string,
    severity: n.severity as string,
    title: n.title as string,
    body: n.body as string,
    status: n.status as string,
    audience: n.audience as string,
    startsAt: n.starts_at as string,
    endsAt: (n.ends_at as string | null) ?? null,
    publishedAt: (n.published_at as string | null) ?? null,
    resolvedAt: (n.resolved_at as string | null) ?? null,
    resolutionNote: (n.resolution_note as string | null) ?? null,
    createdAt: n.created_at as string,
    firmIds: byNotice.get(n.id as string) ?? [],
  }));
}

export type SupportRequest = {
  id: string;
  organizationId: string;
  requestedByName: string;
  ticketRef: string | null;
  scope: string;
  matterId: string | null;
  reason: string;
  minutes: number;
  status: string;
  approvedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  declineReason: string | null;
  createdAt: string;
  uses: number;
};

export async function listSupportRequests(admin: AdminContext): Promise<SupportRequest[]> {
  const [requests, uses] = await Promise.all([
    admin.db
      .from("support_access_requests")
      .select("id, organization_id, requested_by_name, ticket_ref, scope, matter_id, reason, requested_minutes, status, approved_at, starts_at, ends_at, ended_at, decline_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.db.from("support_access_uses").select("request_id").limit(10000),
  ]);
  if (requests.error) fail("support_access_requests", requests.error);
  if (uses.error) fail("support_access_uses", uses.error);
  const useCount = new Map<string, number>();
  for (const u of uses.data ?? []) useCount.set(u.request_id as string, (useCount.get(u.request_id as string) ?? 0) + 1);
  return (requests.data ?? []).map((r) => ({
    id: r.id as string,
    organizationId: r.organization_id as string,
    requestedByName: r.requested_by_name as string,
    ticketRef: (r.ticket_ref as string | null) ?? null,
    scope: String(r.scope),
    matterId: (r.matter_id as string | null) ?? null,
    reason: r.reason as string,
    minutes: Number(r.requested_minutes),
    status: String(r.status),
    approvedAt: (r.approved_at as string | null) ?? null,
    startsAt: (r.starts_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    endedAt: (r.ended_at as string | null) ?? null,
    declineReason: (r.decline_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    uses: useCount.get(r.id as string) ?? 0,
  }));
}
