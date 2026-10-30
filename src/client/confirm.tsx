"use client";
import { useState, type ReactNode } from "react";
import { ApiFailure } from "./api";
import { useAdmin } from "./app";
import { refreshAll } from "./hooks";
import { splitIssues, stepUpNeed } from "./session-rules";
import { ErrorSummary, Alert, CodeInput, Dialog, ErrorAlert, Field, TextArea } from "@/components/ui";

export type ConfirmValues = { reason: string; code?: string; typed: string };

/**
 * ConfirmDialog (spec 1.11): consequence text, optional reason with counter, optional typed confirmation,
 * optional inline 6-digit code when fewer than 60 s of fresh MFA are left (spec 1.6). Keeps input on error.
 */
export function ConfirmDialog({
  title, children, confirmLabel, danger, reason, typed, stepUp, onConfirm, onClose, successToast, extra, disabled,
}: {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reason?: { label?: string; min: number; max: number; hint?: string };
  typed?: { label: ReactNode; value: string };
  stepUp?: boolean;
  onConfirm: (v: ConfirmValues) => Promise<unknown>;
  onClose: (done: boolean) => void;
  successToast?: string;
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const { me, now, withAuth, toast, online } = useAdmin();
  const [reasonText, setReason] = useState("");
  const [typedText, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inlineCode = Boolean(stepUp) && stepUpNeed(me.session, now) === "code";
  const reasonOk = !reason || (reasonText.trim().length >= reason.min && reasonText.length <= reason.max);
  const typedOk = !typed || typedText.trim().toLowerCase() === typed.value.trim().toLowerCase();
  const codeOk = !inlineCode || code.length === 6;
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, ["reason", "code", "confirmEmail"]) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await withAuth((retry) => onConfirm({ reason: reasonText.trim(), typed: typedText.trim(), code: inlineCode && !retry && code ? code : undefined }));
      refreshAll();
      if (successToast) toast(successToast);
      onClose(true);
    } catch (e) {
      setError(e);
    } finally {
      setCode("");
      setBusy(false);
    }
  };

  return (
    <Dialog open title={title} onClose={() => onClose(false)} footer={
      <>
        <button type="button" className="btn" onClick={() => onClose(false)}>Cancel</button>
        <button type="submit" form="confirm-form" className={`btn ${danger ? "danger" : "primary"}`} disabled={busy || !reasonOk || !typedOk || !codeOk || !online || disabled}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </>
    }>
      <form id="confirm-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <ErrorSummary issues={issues} ids={{ reason: "cf-reason", confirmEmail: "cf-typed", code: "cf-code" }} />
        {children}
        {extra}
        {reason ? (
          <TextArea id="cf-reason" label={reason.label ?? "Reason"} hint={reason.hint ?? `${reason.min} to ${reason.max} characters. Saved in the audit log.`} value={reasonText} onChange={setReason} max={reason.max} error={issues?.byField.reason ?? null} />
        ) : null}
        {typed ? (
          <Field id="cf-typed" label={typed.label} error={issues?.byField.confirmEmail ?? null}>
            <input id="cf-typed" className="inp" value={typedText} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        ) : null}
        {inlineCode ? (
          <div className="codebox-wrap">
            <p>Your last authenticator check is older than 15 minutes.</p>
            <CodeInput id="cf-code" value={code} onChange={setCode} error={issues?.byField.code ?? null} />
          </div>
        ) : null}
        {error && !issues ? (
          error instanceof ApiFailure && ["conflict", "forbidden", "not_found", "session_required", "step_up_required"].includes(error.code)
            ? <Alert tone="bad" title={error.message} />
            : <ErrorAlert error={error} />
        ) : null}
      </form>
    </Dialog>
  );
}
