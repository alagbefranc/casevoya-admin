/** Response shapes from docs/FRONTEND-SPEC.md. Keys are snake_case from the database; inputs are camelCase. */
export type Role = "owner" | "operator" | "viewer";

export type SessionStatus = {
  signedIn: boolean;
  userId: string | null;
  aal: string | null;
  expiresAt: number | null;
  stepUpAt: number | null;
  stepUpFreshUntil: number | null;
  matchesAccessUser: boolean;
};

export type Invite = { id: string; role: Role; template_reviewer: boolean; expires_at: string; invited_at: string };

export type Me = {
  email: string;
  userId: string;
  role: Role | null;
  templateReviewer: boolean;
  licensed: boolean;
  verifiedFactors: number | null;
  invite: Invite | null;
  session: SessionStatus;
  capabilities: { read: boolean; operate: boolean; manageAdmins: boolean; reviewTemplates: boolean; acceptInvite: boolean; signInAvailable: boolean };
};

export type Overview = {
  firms: { total: number; live: number; sample: number; by_verification: Record<string, number> };
  subscriptions: { exceptions: number; by_reason: Record<string, number>; by_status: Record<string, number> };
  queues: {
    level: string;
    counts: Record<string, number>;
    oldest_pending_wait_seconds: number | null;
    processing_stuck: number;
    failed_last_hour: number;
  };
  licences: { due: number; overdue: number; never_checked: number; adverse: number; needs_review: number; all: number };
  verification_workload: { firms_pending_review: number; firms_unverified: number; credentials_needing_review: number; credentials_never_checked: number };
  incidents: { active: number; active_incidents: number; worst_severity: string | null; status: string };
  support: { pending: number; active: number };
  templates: { awaiting_review: number; published: number };
  complaints: { open: number; ack_overdue: number; response_overdue: number; total: number };
  generated_at: string;
};

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type FirmRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  slug: string | null;
  verification_status: string;
  sample_mode: boolean;
  created_at: string;
  subscription_status: string | null;
  plan: string | null;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  exception_reasons: string[] | null;
  active_members: number | null;
};

export type GrantRow = {
  id: string;
  organization_id: string;
  firm_name: string | null;
  status: string;
  effective_status: string;
  state: string;
  scope: string;
  matter_id: string | null;
  ticket_ref: string | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  reason: string | null;
  not_included: string | null;
  requested_minutes: number | null;
  created_at: string;
  approved_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  decline_reason: string | null;
  extension_count: number | null;
  minutes_left: number | null;
  uses: number | null;
};

export type GrantPage = Page<GrantRow> & { counts: { pending: number; active: number; closed: number } };

/** `stub: true` endpoints (release notes, breach register, feature flags). */
export type Stub = { stub: true; gap: string } & Record<string, unknown>;
