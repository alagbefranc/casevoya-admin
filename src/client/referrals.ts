import type { Role } from "./types";

/** Find introductions on the Referrals screen. The list comes from the admin API, which omits the address hash. */

export type ConnectStatus = "New" | "Sent";

export type ConnectRequest = {
  id: string;
  status: ConnectStatus;
  goal: string;
  country: string;
  code: string | null;
  zone: string | null;
  language: string;
  name: string;
  email: string;
  submitted_at: string;
  organization_id: string | null;
  firm_name: string | null;
  lead_id: string | null;
  sent_at: string | null;
};

export type IntroductionFirm = { id: string; display_name: string };

export type SendResult = {
  id: string;
  status: "Sent";
  organization_id: string;
  lead_id: string;
  replayed: boolean;
};

export type ReferralList = { items: ConnectRequest[]; counts: { new: number; sent: number } };

/** Fields the screen may show. The address hash and user agent are not among them. */
export const VISIBLE_FIELDS = ["name", "email", "goal", "country", "language", "code", "zone", "status", "submitted_at", "firm_name", "sent_at", "lead_id"] as const;

const SECRET_KEY = /ip_hash|user_agent|useragent|secret/i;

export function roleCanSend(role: Role | null): boolean {
  switch (role) {
    case "owner":
    case "operator":
      return true;
    case "viewer":
    case null:
      return false;
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

export type SendGate = {
  role: Role | null;
  organizationId: string;
  confirmSend: boolean;
  busy: boolean;
  online: boolean;
  codeOk: boolean;
  /** Null while the eligible-firm list has not loaded. Empty means none are eligible right now. */
  firms: IntroductionFirm[] | null;
};

/** Send stays off until a person chooses one currently listed firm and confirms. Nothing is selected by default. */
export function canSend(gate: SendGate): boolean {
  if (!roleCanSend(gate.role)) return false;
  if (!gate.online || gate.busy || !gate.codeOk || gate.confirmSend !== true) return false;
  if (!gate.organizationId || !gate.firms) return false;
  return gate.firms.some((firm) => firm.id === gate.organizationId);
}

/** A second click while the first request is in flight does not start another one. */
export function claimSend(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSend(lock: { current: boolean }): void {
  lock.current = false;
}

/** Drop a firm that is no longer eligible so a stale choice cannot be sent from the form. */
export function keptFirm(selected: string, firms: IntroductionFirm[]): string {
  return firms.some((firm) => firm.id === selected) ? selected : "";
}

export function sendBody(organizationId: string, code?: string): { organizationId: string; confirmSend: true; code?: string } {
  const body: { organizationId: string; confirmSend: true; code?: string } = { organizationId, confirmSend: true };
  if (code) body.code = code;
  return body;
}

export type SendOutcome = { ok: true; result: SendResult } | { ok: false };

/**
 * A failed send leaves the request New. A successful one records the one lead the server returned,
 * including a same-firm replay of that lead.
 */
export function finishSend(row: ConnectRequest, outcome: SendOutcome): { row: ConnectRequest; toast: string | null; close: boolean } {
  if (!outcome.ok || outcome.result.id !== row.id || outcome.result.status !== "Sent" || !outcome.result.lead_id) {
    return { row, toast: null, close: false };
  }
  return {
    row: {
      ...row,
      status: "Sent",
      organization_id: outcome.result.organization_id,
      lead_id: outcome.result.lead_id,
    },
    toast: outcome.result.replayed
      ? "Already sent to that firm. The same lead was returned."
      : "Sent. One lead was created in that firm.",
    close: true,
  };
}

/** Synthetic rows for tests and screenshots. They are not live requests and carry no address hash. */
export const SYNTHETIC_REFERRAL = {
  synthetic: true,
  note: "Synthetic fixture. Not a live introduction.",
  request: {
    id: "00000000-0000-4000-8000-0000000000a1",
    status: "New",
    goal: "Study permit",
    country: "Nigeria",
    code: "CA",
    zone: "Ontario",
    language: "English",
    name: "Fixture Person",
    email: "fixture.person@example.com",
    submitted_at: "2026-11-07T15:04:00.000Z",
    organization_id: null,
    firm_name: null,
    lead_id: null,
    sent_at: null,
  } satisfies ConnectRequest,
  firms: [{ id: "00000000-0000-4000-8000-0000000000b1", display_name: "Fixture Licensed Firm" }] satisfies IntroductionFirm[],
};

export function fixtureHasSecret(value: unknown): boolean {
  return SECRET_KEY.test(JSON.stringify(value));
}
