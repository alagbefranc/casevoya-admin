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

// ---------------------------------------------------------------------------
// Shared templates (ADM-03). Reads only; every write is an audited RPC.
// ---------------------------------------------------------------------------

export type TemplateBody = { title: string; summary: string; items: string[] };

export type TemplateVersionRow = {
  id: string;
  templateId: string;
  stableKey: string;
  templateTitle: string;
  versionNumber: number;
  status: string;
  body: TemplateBody;
  contentHash: string;
  authorName: string;
  authorUserId: string | null;
  testEvidence: string;
  effectiveOn: string;
  changelog: string;
  supersedesVersionId: string | null;
  reviewerLabel: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

const VERSION_COLUMNS =
  "id, template_id, version_number, status, body, content_hash, author_name, author_user_id, test_evidence, effective_on, changelog, supersedes_version_id, reviewer_label, reviewed_at, published_at, created_at";

function asBody(value: unknown): TemplateBody {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    title: typeof v.title === "string" ? v.title : "",
    summary: typeof v.summary === "string" ? v.summary : "",
    items: Array.isArray(v.items) ? v.items.filter((i): i is string => typeof i === "string") : [],
  };
}

function toVersion(row: Record<string, unknown>, templates: Map<string, { key: string; title: string }>): TemplateVersionRow {
  const t = templates.get(row.template_id as string);
  return {
    id: row.id as string,
    templateId: row.template_id as string,
    stableKey: t?.key ?? "?",
    templateTitle: t?.title ?? "?",
    versionNumber: row.version_number as number,
    status: row.status as string,
    body: asBody(row.body),
    contentHash: row.content_hash as string,
    authorName: row.author_name as string,
    authorUserId: (row.author_user_id as string | null) ?? null,
    testEvidence: row.test_evidence as string,
    effectiveOn: row.effective_on as string,
    changelog: row.changelog as string,
    supersedesVersionId: (row.supersedes_version_id as string | null) ?? null,
    reviewerLabel: (row.reviewer_label as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function templateIndex(admin: AdminContext): Promise<Map<string, { key: string; title: string }>> {
  const { data, error } = await admin.db.from("shared_templates").select("id, stable_key, title").limit(2000);
  if (error) fail("shared_templates", error);
  return new Map((data ?? []).map((row) => [row.id as string, { key: row.stable_key as string, title: row.title as string }]));
}

/** Drafts waiting for review, the published versions, and recent decisions. */
export async function templateOverview(admin: AdminContext): Promise<{
  drafts: TemplateVersionRow[];
  published: TemplateVersionRow[];
  recent: TemplateVersionRow[];
  templateCount: number;
}> {
  const templates = await templateIndex(admin);
  const [drafts, published, recent] = await Promise.all([
    admin.db.from("shared_template_versions").select(VERSION_COLUMNS).eq("status", "draft").order("created_at", { ascending: true }).limit(200),
    admin.db.from("shared_template_versions").select(VERSION_COLUMNS).eq("status", "published").order("published_at", { ascending: false }).limit(500),
    admin.db
      .from("shared_template_versions")
      .select(VERSION_COLUMNS)
      .in("status", ["rejected", "superseded", "rolled_back"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);
  if (drafts.error) fail("shared_template_versions (drafts)", drafts.error);
  if (published.error) fail("shared_template_versions (published)", published.error);
  if (recent.error) fail("shared_template_versions (recent)", recent.error);
  const map = (rows: Record<string, unknown>[] | null) => (rows ?? []).map((row) => toVersion(row, templates));
  return { drafts: map(drafts.data), published: map(published.data), recent: map(recent.data), templateCount: templates.size };
}

export type TemplateReview = { decision: string; reviewerLabel: string; reason: string | null; decidedAt: string };

/** One version, the template's current published version, its review history and the database's own diff. */
export async function templateVersionDetail(admin: AdminContext, versionId: string): Promise<{
  version: TemplateVersionRow;
  current: TemplateVersionRow | null;
  reviews: TemplateReview[];
  changes: { field: string; before: string; after: string }[];
} | null> {
  const { data: row, error } = await admin.db.from("shared_template_versions").select(VERSION_COLUMNS).eq("id", versionId).maybeSingle();
  if (error) fail("shared_template_versions", error);
  if (!row) return null;
  const templates = await templateIndex(admin);
  const version = toVersion(row, templates);
  const [currentRes, reviewsRes, diffRes] = await Promise.all([
    admin.db.from("shared_template_versions").select(VERSION_COLUMNS).eq("template_id", version.templateId).eq("status", "published").maybeSingle(),
    admin.db
      .from("shared_template_reviews")
      .select("decision, reviewer_label, reason, decided_at")
      .eq("version_id", versionId)
      .order("decided_at", { ascending: true })
      .limit(50),
    admin.db.rpc("shared_template_diff", { p_version_id: versionId }),
  ]);
  if (currentRes.error) fail("shared_template_versions (current)", currentRes.error);
  if (reviewsRes.error) fail("shared_template_reviews", reviewsRes.error);
  if (diffRes.error) fail("shared_template_diff", diffRes.error);
  const current = currentRes.data && currentRes.data.id !== versionId ? toVersion(currentRes.data, templates) : null;
  const diff = (diffRes.data ?? {}) as { changes?: { field: string; before: string; after: string }[] };
  return {
    version,
    current,
    reviews: (reviewsRes.data ?? []).map((r) => ({
      decision: r.decision as string,
      reviewerLabel: r.reviewer_label as string,
      reason: (r.reason as string | null) ?? null,
      decidedAt: r.decided_at as string,
    })),
    changes: Array.isArray(diff.changes) ? diff.changes : [],
  };
}

export async function officialDomains(admin: AdminContext): Promise<{ host: string; matchKind: string; authority: string }[]> {
  const { data, error } = await admin.db.from("official_source_domains").select("host, match_kind, authority").limit(500);
  if (error) fail("official_source_domains", error);
  return (data ?? []).map((d) => ({ host: d.host as string, matchKind: d.match_kind as string, authority: d.authority as string }));
}

/**
 * Pre-check that mirrors app.platform_template_reviewer(): an active firm_owner/licensed_consultant membership with a
 * consultant credential whose register status is active and that is not suspended or revoked. Display only — the
 * database re-checks (including the credential status rules) when the reviewer approves.
 */
export async function reviewerLicence(admin: AdminContext, userId: string): Promise<{ label: string } | null> {
  const { data: members, error } = await admin.db
    .from("memberships")
    .select("id, organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["firm_owner", "licensed_consultant"])
    .limit(50);
  if (error) fail("memberships", error);
  if (!members?.length) return null;
  const { data: creds, error: credError } = await admin.db
    .from("consultant_credentials")
    .select("licence_type, college_id, membership_id, organization_id, register_status, entitlement_to_practise, discipline_revoked, discipline_suspended, checked_at")
    .in("membership_id", members.map((m) => m.id as string))
    .eq("register_status", "active")
    .order("checked_at", { ascending: false })
    .limit(20);
  if (credError) fail("consultant_credentials", credError);
  const orgOf = new Map(members.map((m) => [m.id as string, m.organization_id as string]));
  const ok = (creds ?? []).find(
    (c) =>
      orgOf.get(c.membership_id as string) === c.organization_id &&
      c.entitlement_to_practise !== false &&
      c.discipline_revoked !== true &&
      c.discipline_suspended !== true,
  );
  return ok ? { label: `${ok.licence_type as string} ${ok.college_id as string}` } : null;
}
