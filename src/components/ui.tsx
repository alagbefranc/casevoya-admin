"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X, XCircle, Ban, Inbox, WifiOff, Clock } from "lucide-react";
import { ApiFailure, describe } from "@/client/api";
import { clock, when, words } from "@/client/format";
import type { Loaded } from "@/client/hooks";
import { useRole } from "@/client/role";

export type Tone = "neutral" | "ok" | "info" | "warn" | "bad";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : tone}`} title={title}>
      {children}
    </span>
  );
}

/** Status colours from DESIGN §7 (spec 1.10). Unknown values render raw in a neutral badge. */
const TONES: Record<string, Tone> = {
  // verification
  verified: "ok", pending_review: "warn", unverified: "neutral", restricted: "bad",
  // subscription
  active: "ok", trial: "info", trialing: "info", trial_ended: "warn", cancelled: "neutral", past_due: "bad", archived: "neutral", none: "neutral",
  // queue / health
  healthy: "ok", degraded: "warn", unhealthy: "bad",
  pending: "warn", processing: "info", published: "ok", failed: "bad", dead_lettered: "bad",
  // incidents
  operational: "ok", maintenance: "info", incident: "warn", major_incident: "bad",
  info: "info", minor: "warn", major: "bad",
  draft: "neutral", scheduled: "info", live: "warn", ended: "warn", resolved: "ok",
  // templates
  superseded: "neutral", rolled_back: "bad", rejected: "bad", awaiting_review: "warn",
  // grants
  approved: "ok", declined: "neutral", expired: "neutral", closed: "neutral",
  // invites
  accepted: "ok",
  // licences
  adverse: "bad", needs_review: "warn", never_checked: "neutral", overdue: "bad", due: "warn", ok: "ok",
  not_entitled: "bad", inactive: "bad", suspended: "bad", revoked: "bad",
  // migration
  staged: "info", checked: "info", complete: "ok", committing: "info", committed: "ok", discarded: "neutral", stuck: "bad",
  // audit
  success: "ok", denied: "warn", failure: "bad",
  // invoices
  open: "warn", paid: "ok", uncollectible: "bad", void: "neutral",
  // privacy outcomes
  fulfilled: "ok", partly_fulfilled: "info", refused: "warn", withdrawn: "neutral",
  // reasons
  invoice_unpaid: "bad", trial_ending: "warn", cancel_scheduled: "warn",
};
const LABELS: Record<string, string> = {
  pending_review: "Pending review", past_due: "Past due", trial_ended: "Trial ended", dead_lettered: "Dead-lettered",
  major_incident: "Major incident", rolled_back: "Rolled back", needs_review: "Needs review", never_checked: "Never checked",
  not_entitled: "Not entitled", invoice_unpaid: "Invoice unpaid", trial_ending: "Trial ending", cancel_scheduled: "Cancel scheduled",
  partly_fulfilled: "Partly fulfilled", awaiting_review: "Awaiting review",
};
export function statusTone(value: string | null | undefined): Tone {
  return (value && TONES[value]) || "neutral";
}
export function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? words(value);
}
export function Status({ value, label, tone }: { value: string | null | undefined; label?: string; tone?: Tone }) {
  if (!value) return <Badge>None</Badge>;
  return <Badge tone={tone ?? statusTone(value)}>{label ?? statusLabel(value)}</Badge>;
}
export function SampleBadge({ on }: { on?: boolean | null }) {
  return on ? <Badge tone="info">Sample</Badge> : null;
}
export function NotBuilt({ children = "Not built" }: { children?: ReactNode }) {
  return <span className="nb" title="This feature does not exist yet">{children}</span>;
}

export function PageHeader({ title, badge, lede, actions, crumb }: { title: ReactNode; badge?: ReactNode; lede?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <>
      {crumb ? <nav className="crumb" aria-label="Breadcrumb">{crumb}</nav> : null}
      <header className="ph">
        <div style={{ minWidth: 0 }}>
          <h1>
            {title} {badge}
          </h1>
          {lede ? <p>{lede}</p> : null}
        </div>
        {actions ? <div className="acts">{actions}</div> : null}
      </header>
    </>
  );
}

export function Panel({ title, icon, right, children, id }: { title?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" aria-labelledby={id}>
      {title ? (
        <h2 id={id}>
          {icon}
          {title}
          {right ? <span className="r">{right}</span> : null}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({ icon, label, value, word, badge, sub, href, children, onClick, className }: {
  className?: string; icon?: ReactNode; label: string; value: ReactNode; word?: boolean; badge?: ReactNode; sub?: ReactNode; href?: string; children?: ReactNode; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="t">{icon}{label}</div>
      <div className={`n ${word ? "word" : ""}`}>{value} {badge}</div>
      {sub ? <div className="s">{sub}</div> : null}
      {children}
    </>
  );
  const cls = `card ${className ?? ""}`;
  if (href) return <Link className={cls} href={href}>{inner}</Link>;
  if (onClick) return <button type="button" className={cls} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export type Column<R> = { key: string; label: ReactNode; render: (row: R) => ReactNode; first?: boolean; className?: string; mobileLabel?: string };

export function DataTable<R>({ caption, columns, rows, rowKey, onRowClick, empty }: {
  caption?: string; columns: Column<R>[]; rows: R[]; rowKey: (row: R) => string; onRowClick?: (row: R) => void; empty?: ReactNode;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="tw">
      <table className="dt">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? "click" : undefined}
              onClick={onRowClick ? (e) => {
                if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
                onRowClick(row);
              } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} data-l={c.first ? "" : c.mobileLabel ?? (typeof c.label === "string" ? c.label : "")} className={[c.first ? "first" : "", c.className ?? ""].join(" ").trim() || undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ total, limit, offset, onOffset }: { total: number; limit: number; offset: number; onOffset: (o: number) => void }) {
  if (!total) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="pager">
      <span>{from}–{to} of {total}</span>
      <span className="r">
        <button type="button" className="btn sm" disabled={offset <= 0} onClick={() => onOffset(Math.max(0, offset - limit))}>Previous</button>
        <button type="button" className="btn sm" disabled={to >= total} onClick={() => onOffset(offset + limit)}>Next</button>
      </span>
    </div>
  );
}

export function Alert({ tone = "info", title, children, actions }: { tone?: Tone; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const Icon = tone === "bad" ? XCircle : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Info;
  return (
    <div className={`alert ${tone}`} role={tone === "bad" || tone === "warn" ? "alert" : "status"}>
      <Icon className="ic" aria-hidden />
      <div style={{ minWidth: 0 }}>
        {title ? <b>{title}</b> : null}
        {children}
      </div>
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

export function RequestIdNote({ id }: { id: string | null | undefined }) {
  return id ? <div className="ref">Reference: {id}</div> : null;
}

/** The error alert for a failed load or action (spec 1.1, 1.8). */
export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const d = describe(error);
  return (
    <Alert tone="bad" title={d.title} actions={onRetry ? <button type="button" className="btn sm" onClick={onRetry}><RefreshCw className="ic" aria-hidden />Retry</button> : null}>
      {d.body ? <div>{d.body}</div> : null}
      <RequestIdNote id={d.requestId} />
    </Alert>
  );
}

export function Empty({ title, children, tone, icon }: { title: ReactNode; children?: ReactNode; tone?: "ok"; icon?: ReactNode }) {
  return (
    <div className={`empty ${tone ?? ""}`}>
      <div className="ki" aria-hidden>{icon ?? (tone === "ok" ? <CheckCircle2 className="ic" /> : <Inbox className="ic" />)}</div>
      <b>{title}</b>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <Empty title="Nothing matches these filters.">
      <p />
      <button type="button" className="btn sm" onClick={onClear}>Clear filters</button>
    </Empty>
  );
}

export function StubPanel({ title = "Not available yet", gap }: { title?: string; gap?: string | null }) {
  return (
    <div className="stub" role="note">
      <Ban className="ic" aria-hidden style={{ width: 20, height: 20, color: "var(--muted)" }} />
      <div>
        <b>{title} <NotBuilt /></b>
        {gap ?? "This feature is not built yet."}
      </div>
    </div>
  );
}

export function Skeleton({ h = 18, w = "100%", style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="sk" style={{ height: h, width: w, ...style }} aria-hidden />;
}
export function SkeletonCards({ n, cls = "g4", h = 104 }: { n: number; cls?: string; h?: number }) {
  return (
    <div className={`grid ${cls}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} h={h} style={{ borderRadius: 22 }} />)}
    </div>
  );
}
export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="pad" style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} h={30} />)}
    </div>
  );
}

/** "Last updated 14:05 (EST)" in amber when a refresh failed but older data is still shown (spec 1.8). */
export function StaleLine({ loaded }: { loaded: Pick<Loaded<unknown>, "stale" | "updatedAt" | "error" | "reload"> }) {
  if (!loaded.stale) return null;
  const d = describe(loaded.error);
  return (
    <div className="stale" role="status">
      <Clock className="ic" aria-hidden />
      <span>Last updated {clock(loaded.updatedAt)}. {d.title}.</span>
      <button type="button" className="linkbtn" onClick={() => void loaded.reload()}>Retry</button>
    </div>
  );
}

export function SlowNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="alert" role="status">
      <Loader2 className="ic" aria-hidden />
      <div>Still loading…</div>
      <div className="acts"><button type="button" className="btn sm" onClick={onRetry}>Retry</button></div>
    </div>
  );
}

export function DeniedState({ role }: { role?: string | null }) {
  const current = useRole();
  const shown = role ?? current;
  return (
    <Empty title="You don't have access to this page." icon={<Ban className="ic" />}>
      <p className="muted">{shown ? <>Your platform role is {words(shown).toLowerCase()}.</> : null} An owner can change roles in Config › Admins.</p>
    </Empty>
  );
}

/**
 * Renders a page section by load state: skeleton while first loading, "Still loading…" after 10 s,
 * permission-denied / not-found / provider error when there is no data, and the content with a stale line
 * when a refresh failed (spec 1.8).
 */
export function Section<T>({ loaded, skeleton, children, role, notFound }: {
  loaded: Loaded<T>; skeleton: ReactNode; children: (data: T) => ReactNode; role?: string | null; notFound?: ReactNode;
}) {
  if (loaded.data !== null) {
    return (
      <>
        <StaleLine loaded={loaded} />
        {children(loaded.data)}
      </>
    );
  }
  if (loaded.error) {
    const e = loaded.error;
    if (e instanceof ApiFailure && e.code === "forbidden") return <DeniedState role={role} />;
    if (e instanceof ApiFailure && e.code === "not_found" && notFound) return <>{notFound}</>;
    return <ErrorAlert error={e} onRetry={() => void loaded.reload()} />;
  }
  return (
    <>
      {loaded.slow ? <SlowNote onRetry={() => void loaded.reload()} /> : null}
      {skeleton}
    </>
  );
}

export function OfflineBanner({ since }: { since: Date | null }) {
  return (
    <div className="alert" role="status">
      <WifiOff className="ic" aria-hidden />
      <div>
        <b>You&apos;re offline</b>
        Showing what was loaded at {clock(since ?? new Date())}. Actions come back when you reconnect.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ overlays

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])") ?? []);
    const first = focusables().find((el) => el.dataset.autofocus !== undefined) ?? focusables().find((el) => !el.classList.contains("x")) ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const a = list[0];
      const z = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Dialog({ open, title, onClose, children, footer, wide }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} style={wide ? { width: "min(640px, 100%)" } : undefined}>
        <div className="dh">
          <h2 id={id}>{title}</h2>
          <button type="button" className="x" aria-label="Close" onClick={onClose}><X className="ic" /></button>
        </div>
        <div className="db">{children}</div>
        {footer ? <div className="df">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ open, title, onClose, children, footer, dirty }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; dirty?: boolean }) {
  const guarded = () => {
    if (dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  };
  const ref = useFocusTrap(open, guarded);
  const id = useId();
  if (!open) return null;
  return (
    <div className="scrim right" onMouseDown={(e) => e.target === e.currentTarget && guarded()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="dh">
          <h2 id={id}>{title}</h2>
          <button type="button" className="x" aria-label="Close" onClick={guarded}><X className="ic" /></button>
        </div>
        <div className="db">{children}</div>
        {footer ? <div className="df">{footer}</div> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fields

export function Field({ label, error, hint, children, id, className }: { label: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; id: string; className?: string }) {
  return (
    <div className={`fld ${error ? "bad" : ""} ${className ?? ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <span className="hint" id={`${id}-hint`}>{hint}</span> : null}
      {error ? <span className="err" id={`${id}-err`}>{error}</span> : null}
    </div>
  );
}

export function TextArea({ id, value, onChange, max, min, label, error, hint, rows = 3 }: {
  id: string; value: string; onChange: (v: string) => void; max: number; min?: number; label: ReactNode; error?: string | null; hint?: ReactNode; rows?: number;
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <textarea id={id} className="inp" rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-err`} />
      <span className="cnt-r" aria-live="polite">{value.length} / {max}{min ? "" : ""}</span>
    </Field>
  );
}

export function CodeInput({ id, value, onChange, label = "Enter the 6-digit code from your authenticator app", error }: { id: string; value: string; onChange: (v: string) => void; label?: string; error?: string | null }) {
  return (
    <div className="codebox-wrap">
      <Field id={id} label={label} error={error}>
        <input id={id} className="inp mono" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ fontSize: 20, letterSpacing: ".4em", maxWidth: 200 }} />
      </Field>
    </div>
  );
}

export function Toasts({ items }: { items: { id: number; text: string }[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className="toast"><CheckCircle2 className="ic" aria-hidden />{t.text}</div>)}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ items, current }: { items: { key: string; label: ReactNode; href: string }[]; current: string }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={t.key === current ? "on" : undefined} aria-current={t.key === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [v, setV] = useState(initial);
  return [v, () => setV((x) => !x), setV];
}

export function Meter({ used, limit, flag }: { used: number; limit: number | null; flag?: "near" | "over" | null }) {
  if (!limit) return null;
  const pct = Math.max(2, Math.min(100, (used / limit) * 100));
  return <div className="bar" aria-hidden><i className={flag === "over" ? "b" : flag === "near" ? "w" : ""} style={{ width: `${pct}%` }} /></div>;
}

// ------------------------------------------------------------------ filter bar (spec 1.11)

/** Filter bar: on phones everything but the search collapses behind a "Filters (n)" button. */
export function FilterBar({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm filter-toggle" aria-expanded={open} onClick={() => setOpen((x) => !x)} style={{ marginBottom: 10 }}>
        Filters{active ? ` (${active})` : ""}
      </button>
      <div className={`filters collapsible ${open ? "open" : ""}`} role="search">{children}</div>
    </>
  );
}

export function SearchField({ id, label, value, onChange, placeholder, max = 100 }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; max?: number }) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    // Follow outside changes (Back, Clear filters).
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === last.current) return;
    const t = setTimeout(() => {
      last.current = text;
      onChange(text);
    }, 300);
    return () => clearTimeout(t);
  }, [text, onChange]);
  return (
    <div className="fld grow keep">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="inp" type="search" maxLength={max} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

export function SelectField({ id, label, value, onChange, options, all = "All" }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; all?: string | null }) {
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {all !== null ? <option value="">{all}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function opts(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: statusLabel(v) }));
}

/** Exception reasons: red when money is owed or access is restricted, amber otherwise. */
export function exceptionTone(reason: string): Tone {
  return reason === "past_due" || reason === "restricted" || reason === "invoice_unpaid" ? "bad" : "warn";
}

export function Timeline({ items }: { items: { key: string; at: string | null; title: ReactNode; meta?: ReactNode }[] }) {
  if (!items.length) return null;
  return (
    <ol className="tl">
      {items.map((i) => (
        <li key={i.key}>
          <time dateTime={i.at ?? undefined}>{when(i.at)}</time>
          <div>{i.title}{i.meta ? <div className="sub">{i.meta}</div> : null}</div>
        </li>
      ))}
    </ol>
  );
}
