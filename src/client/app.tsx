"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, FlaskConical, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw, ShieldCheck, X } from "@/components/icons";
import { api, ApiFailure, describe } from "./api";
import { useApi, useMinuteClock, useOnline, type Loaded } from "./hooks";
import { chipState, navCounts, splitIssues } from "./session-rules";
import { NAV, activeNav } from "./nav";
import { RoleContext } from "./role";
import type { Me, Overview, SessionStatus } from "./types";
import { when } from "./format";
import { Logo } from "./logo";
import { ErrorSummary, Alert, CodeInput, Dialog, ErrorAlert, Field, OfflineBanner, RequestIdNote, Skeleton, Toasts } from "@/components/ui";

// ------------------------------------------------------------------ context

type Ctx = {
  me: Me;
  overview: Overview | null;
  /** The shell's /overview poll (60 s), shared with the Overview page. */
  overviewState: Loaded<Overview>;
  online: boolean;
  /** Seconds since the epoch, ticking each half-minute. */
  now: number;
  reloadMe: () => Promise<void>;
  /**
   * Runs a mutation. On session_required opens Sign-in, on step_up_required opens Step-up, then retries once
   * (spec 1.6). `retry` is true on the second attempt so a one-time inline code is not resent.
   */
  withAuth: <T>(run: (retry: boolean) => Promise<T>) => Promise<T>;
  toast: (text: string) => void;
  openSignIn: () => Promise<boolean>;
  openStepUp: () => Promise<boolean>;
};
const AdminContext = createContext<Ctx | null>(null);
export function useAdmin(): Ctx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminApp");
  return ctx;
}

// ------------------------------------------------------------------ root

export function AdminApp({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // First-admin Setup has its own gate and screens (src/client/setup.tsx); the admin session is not loaded there.
  // Invited admins joining (/join, src/client/join.tsx) likewise have their own gate and screens.
  const onSetup = pathname === "/setup" || pathname.startsWith("/setup/") || pathname === "/join" || pathname.startsWith("/join/");
  const me = useApi<Me>(onSetup ? null : "/session", { poll: 300 });
  const [accessEnded, setAccessEnded] = useState(false);
  useEffect(() => {
    const on = () => setAccessEnded(true);
    window.addEventListener("cv:access-ended", on);
    return () => window.removeEventListener("cv:access-ended", on);
  }, []);

  if (accessEnded) return <AccessEnded />;
  if (onSetup) return <>{children}</>;
  if (!me.data) {
    if (me.error) {
      const e = me.error;
      if (e instanceof ApiFailure && (e.code === "unauthenticated" || e.code === "network")) return <AccessEnded network={e.code === "network"} />;
      if (e instanceof ApiFailure && e.code === "forbidden") return <NoAccessOrSetup message={e.message} />;
      return <GateError error={e} onRetry={() => void me.reload()} />;
    }
    return <BootSkeleton slow={me.slow} onRetry={() => void me.reload()} />;
  }
  return <Provided me={me.data} reloadMe={me.reload}>{children}</Provided>;
}

function Provided({ me, reloadMe, children }: { me: Me; reloadMe: () => Promise<void>; children: ReactNode }) {
  const online = useOnline();
  const now = Math.floor(useMinuteClock() / 1000);
  const overview = useApi<Overview>(me.role ? "/overview" : null, { poll: 60 });
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const [dialog, setDialog] = useState<null | "sign-in" | "step-up">(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback((kind: "sign-in" | "step-up") => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setDialog(kind);
  }), []);
  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog(null);
    if (ok) void reloadMe();
  }, [reloadMe]);

  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  const withAuth = useCallback(async <T,>(run: (retry: boolean) => Promise<T>): Promise<T> => {
    try {
      return await run(false);
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      if (error.code === "session_required" && meRef.current.capabilities.signInAvailable) {
        if (!(await ask("sign-in"))) throw error;
        return run(true);
      }
      if (error.code === "step_up_required") {
        const s = meRef.current.session;
        const ok = s.signedIn && s.matchesAccessUser ? await ask("step-up") : await ask("sign-in");
        if (!ok) throw error;
        return run(true);
      }
      throw error;
    }
  }, [ask]);

  const value = useMemo<Ctx>(() => ({
    me, overview: overview.data, overviewState: overview, online, now, reloadMe, withAuth, toast,
    openSignIn: () => ask("sign-in"), openStepUp: () => ask("step-up"),
  }), [me, overview, online, now, reloadMe, withAuth, toast, ask]);

  return (
    <AdminContext.Provider value={value}>
     <RoleContext.Provider value={me.role}>
      {me.role === null ? <InviteAccept /> : <Shell overview={overview.data}>{children}</Shell>}
      {dialog === "sign-in" ? <SignInDialog email={me.email} onDone={finish} /> : null}
      {dialog === "step-up" ? <StepUpDialog onDone={finish} onNeedSignIn={() => { setDialog("sign-in"); }} /> : null}
      <Toasts items={toasts} />
     </RoleContext.Provider>
    </AdminContext.Provider>
  );
}

// ------------------------------------------------------------------ shell


function NavList({ counts, active, onNavigate }: { counts: ReturnType<typeof navCounts>; active: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((g, gi) => (
        <div key={g.group}>
          {gi ? <div className="grp-sep" aria-hidden /> : null}
          <div className="grp">{g.group}</div>
          <nav aria-label={g.group}>
            {g.items.map((i) => {
              const c = counts[i.key];
              const Icon = i.icon;
              return (
                <Link key={i.key} href={i.href} className={active === i.key ? "on" : undefined} aria-current={active === i.key ? "page" : undefined} title={i.label} onClick={onNavigate}>
                  <Icon className="ic" aria-hidden />
                  <span className="lbl">{i.label}</span>
                  {c ? <span className={`cnt ${c.tone}`}>{c.text}</span> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </>
  );
}

function Shell({ overview, children }: { overview: Overview | null; children: ReactNode }) {
  const { me, online, now } = useAdmin();
  const pathname = usePathname() ?? "/";
  const active = activeNav(pathname);
  const counts = navCounts(overview);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [offlineSince, setOfflineSince] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remember when the connection dropped
    setOfflineSince(online ? null : new Date());
  }, [online]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile menu on navigation
    setMenu(false);
  }, [pathname]);

  return (
    <div className={`frame ${expanded ? "expanded" : ""}`}>
      <aside className="side" aria-label="Main navigation">
        <Link href="/" className="brand"><Logo collapsible /><span>admin</span></Link>
        <button type="button" className="rail-toggle btn sm ghost" style={{ color: "#cfcac4", marginBottom: 6 }} aria-label={expanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
          {expanded ? <PanelLeftClose className="ic" /> : <PanelLeftOpen className="ic" />}
        </button>
        <NavList counts={counts} active={active} />
      </aside>
      <div className="stage">
        <div className="sheet">
          <header className="topbar">
            <button type="button" className="menu-btn" aria-expanded={menu} aria-controls="mobile-nav" onClick={() => setMenu(true)}>
              <Menu className="ic" aria-hidden />Menu
            </button>
            <span className="lbl"><Logo /><span className="full-l">Platform administration</span><span className="m-l">Admin</span></span>
            <span className="sp" />
            <SessionChip session={me.session} now={now} />
            <a className="ex" href="https://app.casevoya.ca"><LogOut className="ic" aria-hidden /><span className="t">Exit</span></a>
            <AvatarMenu />
          </header>
          <MetaBanner sample={overview?.firms?.sample ?? 0} />
          {!online ? <OfflineBanner since={offlineSince} /> : null}
          {me.session.signedIn && !me.session.matchesAccessUser ? <MismatchAlert /> : null}
          <main id="main">{children}</main>
        </div>
      </div>
      <div className="drawer-nav" id="mobile-nav" hidden={!menu} role="dialog" aria-modal="true" aria-label="Menu">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 10px" }}>
          <Logo /><b style={{ color: "#fff", flex: 1 }}>admin</b>
          <button type="button" className="x" style={{ color: "#fff" }} aria-label="Close menu" onClick={() => setMenu(false)}><X className="ic" /></button>
        </div>
        <div className="side-in"><NavList counts={counts} active={active} onNavigate={() => setMenu(false)} /></div>
      </div>
    </div>
  );
}

function MetaBanner({ sample }: { sample: number }) {
  return (
    <div className="banner-meta" role="note">
      <FlaskConical className="ic" aria-hidden />
      <span>
        <b>Operational metadata only.</b> No client content is shown here. Client content needs a firm-approved, time-limited support grant; there is no impersonation.
        {sample > 0 ? <> Firms marked <i>(sample)</i> are demo firms.</> : null}
      </span>
    </div>
  );
}

function MismatchAlert() {
  const { reloadMe } = useAdmin();
  return (
    <Alert tone="warn" title="Session mismatch" actions={<button type="button" className="btn sm" onClick={async () => { await api.post("/session/sign-out").catch(() => null); await reloadMe(); }}>Sign out</button>}>
      Your admin session belongs to a different user. Sign out and sign in again.
    </Alert>
  );
}

function SessionChip({ session, now }: { session: SessionStatus; now: number }) {
  const { me, openSignIn, openStepUp, reloadMe } = useAdmin();
  const chip = chipState(session, now);
  const click = async () => {
    if (!session.signedIn) await openSignIn();
    else if (!session.matchesAccessUser) {
      await api.post("/session/sign-out").catch(() => null);
      await reloadMe();
    } else if (chip.tone !== "ok") await openStepUp();
  };
  const actionable = me.capabilities.signInAvailable && chip.tone !== "ok";
  return (
    <>
      <button type="button" className={`chip ${chip.tone === "neutral" ? "" : chip.tone}`} onClick={actionable ? click : undefined} aria-disabled={!actionable} title={chip.label} aria-label={`Admin session: ${chip.label}`}>
        {chip.tone === "ok" ? <Check className="ic" aria-hidden style={{ width: 13, height: 13 }} /> : <span className="dot" aria-hidden />}
        <span className="t">{chip.label}</span>
      </button>
      {!session.signedIn && me.capabilities.signInAvailable ? <button type="button" className="btn sm signin-b" onClick={click}>Sign in</button> : null}
    </>
  );
}

function AvatarMenu() {
  const { me, reloadMe, toast } = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const initials = me.email.split("@")[0].split(/[._-]/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "A";
  return (
    <div className="avatar" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((x) => !x)}>{initials}</button>
      {open ? (
        <div className="m" role="menu">
          <div className="who">{me.email}<small>{me.role ? `${me.role[0].toUpperCase()}${me.role.slice(1)}` : "Invited"}{me.templateReviewer ? " · template reviewer" : ""}</small></div>
          {me.session.signedIn ? (
            <button type="button" role="menuitem" onClick={async () => {
              setOpen(false);
              await api.post("/session/sign-out").catch(() => null);
              await reloadMe();
              toast("Signed out of the admin session");
            }}><LogOut className="ic" aria-hidden />Sign out of admin session</button>
          ) : null}
          <a role="menuitem" href="/cdn-cgi/access/logout"><ShieldCheck className="ic" aria-hidden />Cloudflare Access sign-out</a>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ sign-in and step-up dialogs (spec 3.2, 3.3)

function SignInDialog({ email, onDone }: { email: string; onDone: (ok: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const issues = error instanceof ApiFailure && error.code === "validation_failed" ? splitIssues(error.issues, ["password", "code"]) : null;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/session/sign-in", { password, code });
      onDone(true);
    } catch (e) {
      setError(e);
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  const other = error && !issues ? error : null;
  return (
    <Dialog open title="Sign in to the admin portal" onClose={() => onDone(false)} footer={
      <>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        <button type="submit" form="signin-form" className="btn primary" disabled={busy || !password || code.length !== 6}>{busy ? "Signing in…" : "Sign in"}</button>
      </>
    }>
      <form id="signin-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <ErrorSummary issues={issues} ids={{ password: "si-password", code: "si-code" }} />
        <p>Use the password and authenticator app for your Access email.</p>
        <Field id="si-email" label="Access email" hint="This is the email Cloudflare Access signed you in with.">
          <input id="si-email" className="inp" value={email} readOnly aria-readonly style={{ background: "var(--paper)" }} />
        </Field>
        <Field id="si-password" label="Password" error={issues?.byField.password ? "Email or password was not accepted." : null}>
          <input id="si-password" className="inp" type="password" autoComplete="current-password" maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <CodeInput id="si-code" label="6-digit code" value={code} onChange={setCode} error={issues?.byField.code ? "That authenticator code was not accepted." : null} />
        {other instanceof ApiFailure && other.code === "forbidden" ? (
          <Alert tone="bad" title="No authenticator app">{other.message}. <a href="https://app.casevoya.ca">Set one up in Casevoya (Settings › Security)</a>.</Alert>
        ) : other ? <ErrorAlert error={other} /> : null}
      </form>
    </Dialog>
  );
}

function StepUpDialog({ onDone, onNeedSignIn }: { onDone: (ok: boolean) => void; onNeedSignIn: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/session/step-up", { code });
      onDone(true);
    } catch (e) {
      setCode("");
      if (e instanceof ApiFailure && e.code === "session_required") onNeedSignIn();
      else setError(e);
    } finally {
      setBusy(false);
    }
  };
  const bad = error instanceof ApiFailure && error.code === "validation_failed";
  return (
    <Dialog open title="Confirm it's you" onClose={() => onDone(false)} footer={
      <>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        <button type="submit" form="stepup-form" className="btn primary" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
      </>
    }>
      <form id="stepup-form" className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <p>This action needs an authenticator code from the last 15 minutes.</p>
        <CodeInput id="su-code" value={code} onChange={setCode} error={bad ? "That authenticator code was not accepted." : null} />
        {error && !bad ? <ErrorAlert error={error} /> : null}
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ full-page session screens (spec 3.4, 3.5)

function Full({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <main className="full">
      <div className="box">
        <div className="brandline"><Logo tone="dark" />admin</div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function BootSkeleton({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <div className="frame">
      <aside className="side" aria-hidden><div className="brand"><Logo collapsible /><span>admin</span></div></aside>
      <div className="stage">
        <div className="sheet" aria-busy="true" aria-label="Loading">
          <div className="topbar"><span className="lbl"><Logo /><span className="full-l">Platform administration</span></span></div>
          <div style={{ display: "grid", gap: 14, paddingTop: 20 }}>
            {slow ? <Alert actions={<button type="button" className="btn sm" onClick={onRetry}>Retry</button>}>Still loading…</Alert> : null}
            <Skeleton h={36} w={260} />
            <Skeleton h={110} />
            <Skeleton h={240} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Not an admin: while no platform admin exists yet the allow-listed Access user is sent to /setup (the server
 * decides via GET /setup: 200 = open). Someone with an open invite but no account yet is sent to /join. Otherwise,
 * or if those checks fail, "No access".
 */
function NoAccessOrSetup({ message }: { message: string }) {
  const router = useRouter();
  const setup = useApi<{ state: string }>("/setup");
  const join = useApi<{ state: string }>("/join");
  const open = setup.data?.state === "open";
  const invited = join.data?.state === "open";
  useEffect(() => {
    if (open) router.replace("/setup");
    else if (invited) router.replace("/join");
  }, [open, invited, router]);
  if (setup.loading || join.loading || open || invited) return <BootSkeleton slow={false} onRetry={() => void setup.reload()} />;
  return <NoAccess message={message} />;
}

function NoAccess({ message }: { message: string }) {
  return (
    <Full title="You don't have access to the admin portal">
      <p>{message}.</p>
      <p>Ask an owner to invite you. Owners add admins in Config › Admins.</p>
      <a className="btn" href="/cdn-cgi/access/logout"><LogOut className="ic" aria-hidden />Sign out of Access</a>
    </Full>
  );
}

function GateError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const d = describe(error);
  return (
    <Full title="The portal can't check your access right now">
      <p>{d.title}. Nothing was changed. Try again in a moment.</p>
      <RequestIdNote id={d.requestId} />
      <p />
      <button type="button" className="btn primary" onClick={onRetry}><RefreshCw className="ic" aria-hidden />Try again</button>
    </Full>
  );
}

function AccessEnded({ network }: { network?: boolean }) {
  return (
    <Full title={network ? "Casevoya admin could not be reached" : "Your Cloudflare Access sign-in ended"}>
      <p>{network ? "Check your connection, then reload. Cloudflare Access may ask you to sign in again." : "Reload the page and Cloudflare Access will ask you to sign in again. Nothing was changed."}</p>
      <button type="button" className="btn primary" onClick={() => window.location.reload()}><RefreshCw className="ic" aria-hidden />Reload</button>
    </Full>
  );
}

function InviteAccept() {
  const { me, withAuth, openSignIn, reloadMe } = useAdmin();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const invite = me.invite;
  if (!invite) return <NoAccess message="This user is not a platform admin and has no open invite" />;
  const signedIn = me.session.signedIn && me.session.matchesAccessUser;
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await withAuth(() => api.post("/session/accept-invite", { confirm: true }));
      router.replace("/");
      await reloadMe();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Full title="You've been invited">
      <p>You&apos;ve been invited as <b>{invite.role}</b> (template reviewer: {invite.template_reviewer ? "yes" : "no"}). Expires {when(invite.expires_at)}.</p>
      <ol className="steps">
        <li className={signedIn ? "done" : undefined}>
          <div><b>Sign in</b><small>Password and authenticator app for {me.email}</small>
            {!signedIn && me.capabilities.signInAvailable ? <div style={{ marginTop: 8 }}><button type="button" className="btn sm" onClick={() => void openSignIn()}>Sign in</button></div> : null}
            {!me.capabilities.signInAvailable ? <small>Own-session actions are unavailable on this deployment.</small> : null}
          </div>
        </li>
        <li><div><b>Accept the role</b></div></li>
      </ol>
      <p className="muted-note">No authenticator app on your account yet? <Link href="/join">Set it up and accept here</Link>.</p>
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        I accept the platform admin role
      </label>
      {error ? (
        error instanceof ApiFailure && ["forbidden", "validation_failed", "conflict", "step_up_required"].includes(error.code)
          ? <Alert tone="bad" title={error.message}>{error.code === "forbidden" ? "Sign in with your authenticator app to accept, or ask an owner for a new invite." : null}</Alert>
          : <ErrorAlert error={error} />
      ) : null}
      <button type="button" className="btn primary" disabled={!confirm || busy} onClick={() => void accept()}>{busy ? "Accepting…" : "Accept invite"}</button>
    </Full>
  );
}

// ------------------------------------------------------------------ viewer-aware helpers

/** Renders children only when the role may act (viewers see nothing, spec 1.4). */
export function CanOperate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { me } = useAdmin();
  return <>{me.capabilities.operate ? children : fallback}</>;
}

export function NotSignedInNote() {
  const { me } = useAdmin();
  if (me.capabilities.signInAvailable) return null;
  return <Alert tone="warn" title="Own-session actions are unavailable on this deployment." />;
}

