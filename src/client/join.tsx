"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LogOut, RefreshCw } from "@/components/icons";
import { api, ApiFailure, describe } from "./api";
import { useApi } from "./hooks";
import { Alert, Field, Skeleton } from "@/components/ui";
import { ActionError, AuthenticatorStep, Bars, Card, Checks, Submit, fieldError } from "./setup";

/**
 * Joining as an invited admin (/join, docs/ACCESS.md). The invite email links here. Step 1 create your Casevoya
 * account (or sign in to your existing one), step 2 authenticator app, step 3 accept the invite. The server checks
 * the open invite on every request (the join gate).
 */

export type JoinState = {
  state: "open";
  email: string;
  step: "account" | "authenticator" | "finish";
  invite: { role: "owner" | "operator" | "viewer"; templateReviewer: boolean; expiresAt: string };
  account: { exists: boolean; fullName: string | null; confirmed: boolean | null };
  authenticator: { verified: boolean; pending: boolean };
  passwordMinLength: number;
  signInAvailable: boolean;
};

export const ROLE_TEXT: Record<JoinState["invite"]["role"], string> = {
  owner: "Everything an operator can do, plus product settings and managing admins.",
  operator: "Handles support, notices, retries, licence checks and template drafts.",
  viewer: "Can read everything in the portal but can't change anything.",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export function JoinScreen() {
  const state = useApi<JoinState>("/join");
  const [step, setStep] = useState<JoinState["step"] | "done" | null>(null);
  const current = step ?? state.data?.step ?? null;
  if (state.error && !state.data) return <JoinError error={state.error} onRetry={() => void state.reload()} />;
  if (!state.data || !current) {
    return (
      <Card busy label="Loading your invite">
        <Bars step="account" />
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}><Skeleton h={30} w="75%" /><Skeleton h={44} /><Skeleton h={42} /><Skeleton h={42} /></div>
      </Card>
    );
  }
  const s = state.data;
  if (current === "account") return <JoinAccount s={s} onDone={() => setStep("authenticator")} />;
  if (current === "authenticator") return <AuthenticatorStep base="/join" s={s} onDone={() => setStep("finish")} onNeedAccount={() => setStep("account")} />;
  if (current === "finish") return <JoinFinish s={s} onDone={() => setStep("done")} onBack={() => setStep("authenticator")} />;
  return <JoinDone role={s.invite.role} />;
}

function JoinError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const d = describe(error);
  const already = error instanceof ApiFailure && error.code === "conflict" && Boolean((error.details as { alreadyAdmin?: boolean } | null)?.alreadyAdmin);
  const noInvite = error instanceof ApiFailure && error.code === "forbidden";
  return (
    <Card>
      <h1>{already ? "You're already an admin" : noInvite ? "There's no open invite for you" : "We couldn't load your invite"}</h1>
      <p>{already ? "Open the portal home page and sign in." : noInvite ? "The invite may have expired or been cancelled. Ask an owner to invite you again, from Config › Admins." : `${d.title}. Try again in a moment.`}</p>
      {already ? <Link className="btn primary" href="/">Go to the portal</Link> : noInvite ? <a className="btn" href="/cdn-cgi/access/logout"><LogOut className="ic" aria-hidden />Sign out of Access</a> : <button type="button" className="btn primary" onClick={onRetry}><RefreshCw className="ic" aria-hidden />Try again</button>}
    </Card>
  );
}

function JoinAccount({ s, onDone }: { s: JoinState; onDone: () => void }) {
  const [fullName, setFullName] = useState(s.account.fullName ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ fullName?: string; password?: string }>({});
  const min = s.passwordMinLength;
  const exists = s.account.exists;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issues: typeof local = {};
    if (fullName.trim().length < 2) issues.fullName = "Enter your full name";
    if (password.length < min) issues.password = `Use at least ${min} characters`;
    setLocal(issues);
    if (Object.keys(issues).length) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/join/account", { fullName: fullName.trim(), password });
      setPassword("");
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const nameErr = local.fullName ?? fieldError(error, "fullName");
  const pwErr = local.password ?? fieldError(error, "password");
  return (
    <Card>
      <Bars step="account" />
      <h1>Join Casevoya admin</h1>
      <p>You&apos;re invited as <b>{s.invite.role}</b>{s.invite.templateReviewer && s.invite.role !== "viewer" ? " and template reviewer" : ""}. {ROLE_TEXT[s.invite.role]} The invite expires {when(s.invite.expiresAt)}.</p>
      <p>{exists ? "You already have a Casevoya account. Enter its password." : "First, create your Casevoya account."}</p>
      {!s.signInAvailable ? <Alert tone="warn" title="Signing in is unavailable on this deployment">Ask the owner to check the portal&apos;s configuration.</Alert> : null}
      <form className="setup-form" onSubmit={(e) => void submit(e)} noValidate>
        <Field id="join-name" label="Full name" error={nameErr}>
          <input id="join-name" className="inp" autoComplete="name" placeholder="Your name" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} aria-invalid={Boolean(nameErr)} />
        </Field>
        <Field id="join-email" label="Work email" hint="From your Cloudflare Access sign-in. It can't be changed here.">
          <input id="join-email" className="inp" type="email" value={s.email} readOnly aria-readonly="true" />
        </Field>
        <Field id="join-password" label={exists ? "Password" : "Choose a password"} error={pwErr} hint={exists ? "The password you use for this Casevoya account." : undefined}>
          <input id="join-password" className="inp" type="password" autoComplete={exists ? "current-password" : "new-password"} placeholder={`At least ${min} characters`} value={password} maxLength={200} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(pwErr)} />
        </Field>
        <ActionError error={error} />
        <Checks items={["You'll set up an authenticator app next", "Then you accept the invite", "This is logged in the audit log"]} />
        <Submit busy={busy} busyLabel={exists ? "Checking…" : "Creating…"} disabled={!s.signInAvailable}>{exists ? "Continue" : "Create account"}</Submit>
      </form>
    </Card>
  );
}

function JoinFinish({ s, onDone, onBack }: { s: JoinState; onDone: () => void; onBack: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const finish = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/join/finish", { confirm: true });
      onDone();
    } catch (err) {
      if (err instanceof ApiFailure && err.code === "step_up_required") return onBack();
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Bars step="finish" />
      <h1>Accept the invite</h1>
      <p>Your account and authenticator app are ready. Accept to become {s.invite.role === "viewer" ? "a" : "an"} <b>{s.invite.role}</b>. {ROLE_TEXT[s.invite.role]}</p>
      <form className="setup-form" onSubmit={(e) => void finish(e)}>
        <label className="check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I accept the {s.invite.role} role
        </label>
        <ActionError error={error} />
        <Submit busy={busy} busyLabel="Accepting…" disabled={!confirm}>Accept invite</Submit>
      </form>
    </Card>
  );
}

function JoinDone({ role }: { role: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/"), 1800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <Card>
      <Bars step="done" />
      <h1>You&apos;re in</h1>
      <Alert tone="ok" title={`You're now ${role === "viewer" ? "a" : "an"} ${role}`}>Taking you to the Overview…</Alert>
      <button type="button" className="btn primary" onClick={() => router.replace("/")}><CheckCircle2 className="ic" aria-hidden />Go to Overview</button>
    </Card>
  );
}
