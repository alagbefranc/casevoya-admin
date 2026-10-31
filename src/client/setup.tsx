"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleCheck, KeyRound, Loader2, Lock, RefreshCw } from "@/components/icons";
import { api, ApiFailure, describe } from "./api";
import { useApi } from "./hooks";
import { Logo } from "./logo";
import { Alert, CodeInput, ErrorAlert, Field, RequestIdNote, Skeleton } from "@/components/ui";

/**
 * First-admin Setup (/setup, docs/BOOTSTRAP.md, design HANDOFF "Setup (first admin)"). Shown only while
 * public.platform_admins is empty; the server checks that on every request and answers 409 once it is not.
 * Step 1 account, step 2 authenticator app, step 3 become the owner.
 */

export type SetupState = {
  state: "open";
  email: string;
  step: "account" | "authenticator" | "finish";
  account: { exists: boolean; fullName: string | null };
  authenticator: { verified: boolean; pending: boolean };
  passwordMinLength: number;
  signInAvailable: boolean;
};

type Enrolment = { mode: "new"; factorId: string; qrCode: string; secret: string; uri: string } | { mode: "pending" } | { mode: "existing" };

const STEPS = ["account", "authenticator", "finish"] as const;


export function Card({ children, busy, label }: { children: ReactNode; busy?: boolean; label?: string }) {
  return (
    <main className="full">
      <div className="box setup" aria-busy={busy || undefined} aria-label={label}>
        <div className="brandline"><Logo tone="dark" />admin</div>
        {children}
      </div>
    </main>
  );
}

export function Bars({ step }: { step: (typeof STEPS)[number] | "done" }) {
  const at = step === "done" ? 3 : STEPS.indexOf(step);
  return (
    <div className="bars" role="img" aria-label={step === "done" ? "Complete" : `Step ${at + 1} of 3`}>
      {STEPS.map((s, i) => <span key={s} className={i < at ? "done" : i === at ? "on" : undefined} />)}
    </div>
  );
}

export function Checks({ items }: { items: string[] }) {
  return (
    <ul className="checks">
      {items.map((t) => <li key={t}><CircleCheck className="ic" aria-hidden />{t}</li>)}
    </ul>
  );
}

/** A primary button whose spinner sits inside the flex gap, so it never overlaps the label (390 px fix). */
export function Submit({ busy, busyLabel, children, disabled, type = "submit", onClick }: { busy: boolean; busyLabel: string; children: ReactNode; disabled?: boolean; type?: "submit" | "button"; onClick?: () => void }) {
  return (
    <button type={type} className="btn primary" disabled={busy || disabled} aria-busy={busy || undefined} onClick={onClick}>
      {busy ? <><Loader2 className="ic spin" aria-hidden /><span>{busyLabel}</span></> : children}
    </button>
  );
}

function lockedAt(error: unknown): string | null | undefined {
  if (!(error instanceof ApiFailure) || error.code !== "conflict") return undefined;
  const d = error.details as { locked?: boolean; lockedAt?: string | null } | null;
  return d?.locked ? (d.lockedAt ?? null) : undefined;
}

export function fieldError(error: unknown, path: string): string | null {
  if (!(error instanceof ApiFailure) || error.code !== "validation_failed") return null;
  return error.issues.find((i) => i.path === path)?.message ?? null;
}

export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiFailure && ["validation_failed", "rate_limited", "conflict", "forbidden", "session_required", "step_up_required"].includes(error.code)) {
    if (error.code === "validation_failed" && error.issues.length) return null; // shown on the field
    return <Alert tone="bad" title={error.message}><RequestIdNote id={error.requestId} /></Alert>;
  }
  return <ErrorAlert error={error} />;
}

export function SetupScreen() {
  const state = useApi<SetupState>("/setup");
  const [step, setStep] = useState<SetupState["step"] | "done" | null>(null);
  const [retrying, setRetrying] = useState(false);
  const locked = lockedAt(state.error);
  const current = step ?? state.data?.step ?? null;

  const retry = async () => {
    setRetrying(true);
    try {
      await state.reload();
    } finally {
      setRetrying(false);
    }
  };

  if (locked !== undefined) return <Locked at={locked} />;
  if (state.error && !state.data) return <SetupError error={state.error} busy={retrying || state.loading} onRetry={() => void retry()} />;
  if (!state.data || !current) return <SetupLoading />;
  const s = state.data;
  if (current === "account") return <AccountStep s={s} onDone={() => setStep("authenticator")} />;
  if (current === "authenticator") return <AuthenticatorStep s={s} onDone={() => setStep("finish")} onNeedAccount={() => setStep("account")} />;
  if (current === "finish") return <FinishStep onDone={() => setStep("done")} onBack={() => setStep("authenticator")} />;
  return <Done />;
}

function SetupLoading() {
  return (
    <Card busy label="Loading setup">
      <Bars step="account" />
      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <Skeleton h={30} w="75%" />
        <Skeleton h={44} />
        <Skeleton h={14} w={90} />
        <Skeleton h={42} />
        <Skeleton h={14} w={90} />
        <Skeleton h={42} />
        <Skeleton h={44} style={{ marginTop: 8 }} />
      </div>
    </Card>
  );
}

function SetupError({ error, busy, onRetry }: { error: unknown; busy: boolean; onRetry: () => void }) {
  const d = describe(error);
  const known = error instanceof ApiFailure && ["forbidden", "unauthenticated"].includes(error.code);
  return (
    <Card>
      <h1>We couldn&apos;t check setup</h1>
      <Alert tone="bad" title={known ? d.title : "The server didn't answer"}>
        <div>{d.requestId ? <>Request <span className="mono">{d.requestId}</span>. </> : null}No account was created. Try again in a moment.</div>
      </Alert>
      <Submit type="button" busy={busy} busyLabel="Checking…" onClick={onRetry}><RefreshCw className="ic" aria-hidden />Try again</Submit>
    </Card>
  );
}

function Locked({ at }: { at: string | null }) {
  const date = at ? new Date(at).toLocaleString("en-CA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : null;
  return (
    <Card>
      <span className="pill-lock"><Lock className="ic" aria-hidden />Setup is locked</span>
      <h1>This step is already done</h1>
      <p>The first platform admin was created{date ? <> on {date}</> : null}. This page only works once, so nobody can use it to make another owner.</p>
      <dl className="kv-rows">
        <div><dt>Created through</dt><dd>Admin portal Setup or the server script</dd></div>
        <div><dt>Logged</dt><dd>In the audit log<br /><span className="mono">platform_admin.bootstrapped</span></dd></div>
      </dl>
      <p>Need another admin? Ask an existing owner to invite you from <b>Config › Admins</b>.</p>
      <Link className="btn primary" href="/"><ArrowRight className="ic" aria-hidden />Sign in to admin</Link>
    </Card>
  );
}

function AccountStep({ s, onDone }: { s: SetupState; onDone: () => void }) {
  const [fullName, setFullName] = useState(s.account.fullName ?? "");
  const [password, setPassword] = useState("");
  const [reset, setReset] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<{ fullName?: string; password?: string }>({});
  const min = s.passwordMinLength;
  const canReset = error instanceof ApiFailure && Boolean((error.details as { canReset?: boolean } | null)?.canReset);
  const unconfirmed = error instanceof ApiFailure && Boolean((error.details as { unconfirmed?: boolean } | null)?.unconfirmed);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issues: typeof local = {};
    if (fullName.trim().length < 2) issues.fullName = "Enter your full name";
    if (password.length < min) issues.password = `Use at least ${min} characters`;
    setLocal(issues);
    if (Object.keys(issues).length) return;
    if (reset && !confirmReset) return;
    setBusy(true);
    setError(null);
    try {
      if (reset) await api.post("/setup/password", { fullName: fullName.trim(), password, confirm: true });
      else await api.post("/setup/account", { fullName: fullName.trim(), password });
      setPassword("");
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const exists = s.account.exists;
  const nameErr = local.fullName ?? fieldError(error, "fullName");
  const pwErr = local.password ?? fieldError(error, "password");
  return (
    <Card>
      <Bars step="account" />
      <h1>{reset ? "Set a new password" : "Create the first admin"}</h1>
      <p>
        {reset
          ? "This replaces the password on your Casevoya account. It works only until the first admin exists."
          : exists
            ? "One time only. Your Casevoya account already exists, so enter its password. After this, the page locks and new admins are invited from inside the portal."
            : "One time only. You become the first owner. After this, the page locks and new admins are invited from inside the portal."}
      </p>
      {!s.signInAvailable ? <Alert tone="warn" title="Setup can't sign you in on this deployment">The Supabase publishable key is missing. Use the server script in docs/BOOTSTRAP.md instead.</Alert> : null}
      <form className="setup-form" onSubmit={(e) => void submit(e)} noValidate>
        <Field id="setup-name" label="Full name" error={nameErr}>
          <input id="setup-name" className="inp" autoComplete="name" placeholder="Your name" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} aria-invalid={Boolean(nameErr)} aria-describedby="setup-name-err" />
        </Field>
        <Field id="setup-email" label="Work email" hint="From your Cloudflare Access sign-in. It can't be changed here.">
          <input id="setup-email" className="inp" type="email" value={s.email} readOnly aria-readonly="true" aria-describedby="setup-email-hint" />
        </Field>
        <Field id="setup-password" label={reset ? "New password" : "Password"} error={pwErr} hint={exists && !reset ? "The password you use for this Casevoya account." : undefined}>
          <input id="setup-password" className="inp" type="password" autoComplete={exists && !reset ? "current-password" : "new-password"} placeholder={`At least ${min} characters`} value={password} maxLength={200} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(pwErr)} aria-describedby="setup-password-hint setup-password-err" />
        </Field>
        {canReset && !reset ? (
          <Alert tone="warn" title={unconfirmed ? "This account's email was never confirmed" : "Forgot this account's password?"}>
            <div>{unconfirmed ? "Set a new password here to take over the account. Any authenticators already on it are removed." : "You can set a new one here while setup is still open."}</div>
            <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => { setReset(true); setError(null); setPassword(""); }}>Set a new password</button>
          </Alert>
        ) : null}
        {reset ? (
          <label className="check">
            <input type="checkbox" checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} />
            Replace the password on {s.email}
          </label>
        ) : null}
        <ActionError error={error} />
        <Checks items={["You'll set up an authenticator app next", "You become the Owner and can invite others", "This is logged in the audit log"]} />
        <Submit busy={busy} busyLabel={reset ? "Saving…" : exists ? "Checking…" : "Creating…"} disabled={!s.signInAvailable || (reset && !confirmReset)}>
          {reset ? "Save password and continue" : exists ? "Continue" : "Create owner account"}
        </Submit>
        {reset ? <button type="button" className="btn ghost" onClick={() => { setReset(false); setConfirmReset(false); setError(null); }}>Back</button> : null}
      </form>
    </Card>
  );
}

function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function AuthenticatorStep({ s, onDone, onNeedAccount, base = "/setup" }: { s: Pick<SetupState, "email">; onDone: () => void; onNeedAccount: () => void; base?: "/setup" | "/join" }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  const start = async (restart: boolean) => {
    setStarting(true);
    setLoadError(null);
    setError(null);
    try {
      setEnrolment(await api.post<Enrolment>(`${base}/authenticator`, { restart }));
    } catch (err) {
      if (err instanceof ApiFailure && err.code === "session_required") return onNeedAccount();
      setLoadError(err);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    // Once per mount (StrictMode runs effects twice): a second call would see the pending factor and hide the QR.
    if (started.current) return;
    started.current = true;
    void start(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(new ApiFailure("validation_failed", "Enter the 6-digit code", 422, null, { issues: [{ path: "code", message: "Enter the 6-digit code" }] }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/authenticator/verify`, { code });
      onDone();
    } catch (err) {
      setCode("");
      if (err instanceof ApiFailure && err.code === "session_required") return onNeedAccount();
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card busy={starting && !enrolment}>
      <Bars step="authenticator" />
      <h1>Add your authenticator app</h1>
      {!enrolment ? (
        loadError ? (
          <>
            <ErrorAlert error={loadError} />
            <Submit type="button" busy={starting} busyLabel="Starting…" onClick={() => void start(false)}><RefreshCw className="ic" aria-hidden />Try again</Submit>
          </>
        ) : (
          <div style={{ display: "grid", gap: 12 }} aria-label="Preparing your QR code">
            <Skeleton h={14} w="80%" />
            <Skeleton h={180} w={180} style={{ margin: "6px auto" }} />
            <Skeleton h={42} />
          </div>
        )
      ) : (
        <form className="setup-form" onSubmit={(e) => void verify(e)} noValidate>
          {enrolment.mode === "new" ? (
            <>
              <p>Scan this with an authenticator app (1Password, Google Authenticator, Authy), then enter the 6-digit code it shows. Signing in to admin will always need it.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr" src={enrolment.qrCode} width={180} height={180} alt="QR code to add Casevoya admin to your authenticator app" />
              <div className="manual-key">
                <span>Can&apos;t scan? Enter this key</span>
                <code className="mono" aria-label="Manual setup key">{groupKey(enrolment.secret)}</code>
              </div>
            </>
          ) : enrolment.mode === "pending" ? (
            <Alert title="You already scanned a QR code">
              Enter the current code from the &ldquo;Casevoya admin&rdquo; entry in your authenticator app. Lost it?{" "}
              <button type="button" className="linkbtn" onClick={() => void start(true)} disabled={starting}>Show a new QR code</button>
            </Alert>
          ) : (
            <p>Your account already has an authenticator app. Enter the code it shows for Casevoya.</p>
          )}
          <CodeInput id="setup-code" value={code} onChange={setCode} error={fieldError(error, "code")} />
          <ActionError error={error} />
          <Submit busy={busy} busyLabel="Verifying…" disabled={starting}><KeyRound className="ic" aria-hidden />Verify and continue</Submit>
          {enrolment.mode === "new" ? <button type="button" className="btn ghost" onClick={() => void start(true)} disabled={starting}>{starting ? "Making a new code…" : "Show a different QR code"}</button> : null}
          <p className="muted-note">Passkeys: coming later. Signed in as {s.email}.</p>
        </form>
      )}
    </Card>
  );
}

function FinishStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const finish = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/setup/finish", { confirm: true });
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
      <h1>Become the owner</h1>
      <p>Your account and authenticator app are ready. Finish to become the first Owner of Casevoya admin. Setup then locks for good.</p>
      <form className="setup-form" onSubmit={(e) => void finish(e)}>
        <Checks items={["Owner role, recorded in the audit log", "Invite other admins from Config › Admins", "This page locks for everyone"]} />
        <label className="check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I&apos;m the platform owner and want to finish setup
        </label>
        <ActionError error={error} />
        <Submit busy={busy} busyLabel="Finishing…" disabled={!confirm}>Finish setup</Submit>
      </form>
    </Card>
  );
}

function Done() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/"), 1800);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <Card>
      <Bars step="done" />
      <h1>You&apos;re the owner</h1>
      <Alert tone="ok" title="Setup is complete">Taking you to the Overview…</Alert>
      <button type="button" className="btn primary" onClick={() => router.replace("/")}><CheckCircle2 className="ic" aria-hidden />Go to Overview</button>
    </Card>
  );
}
