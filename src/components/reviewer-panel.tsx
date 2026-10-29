import { reviewerSignIn, reviewerSignOut } from "@/app/templates/actions";
import { when } from "@/lib/format";

/** Shows whether you can review, and the reviewer sign-in (password + authenticator code) when you can. */
export function ReviewerPanel(props: {
  flagged: boolean;
  hasKey: boolean;
  licenceLabel: string | null;
  session: { userId: string; aal: string | null; expiresAt: number | null } | null;
  userId: string;
  email: string;
  next?: string;
}) {
  const { flagged, hasKey, licenceLabel, session, userId, email, next } = props;
  const mine = session && session.userId === userId;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <strong>Licensed reviewer</strong>{" "}
      {flagged ? <span className="pill ok">flagged</span> : <span className="pill">not flagged</span>}{" "}
      {licenceLabel ? <span className="pill ok">licence {licenceLabel}</span> : <span className="pill warn">no verified licence on file</span>}
      <p className="hint" style={{ margin: "6px 0" }}>
        Only an admin listed in TEMPLATE_REVIEWER_EMAILS, holding an active verified licence, and signed in below as
        themselves can approve or reject. The draft&apos;s author never can. The database enforces the same rules.
      </p>
      {!flagged ? null : !hasKey ? (
        <p className="err">Reviewer sign-in is unavailable: the Worker has no SUPABASE_PUBLISHABLE_KEY.</p>
      ) : mine ? (
        <form action={reviewerSignOut} className="inline">
          <input type="hidden" name="next" value={next ?? ""} />
          <span className="hint">
            Reviewer session active ({session.aal ?? "?"}), until {when(session.expiresAt ? new Date(session.expiresAt * 1000).toISOString() : null)}.
          </span>
          <button type="submit" className="secondary">End reviewer session</button>
        </form>
      ) : (
        <form action={reviewerSignIn} className="stack" autoComplete="off">
          <input type="hidden" name="next" value={next ?? ""} />
          <label>Email<input value={email} readOnly /></label>
          <label>Casevoya password<input type="password" name="password" required autoComplete="current-password" /></label>
          <label>Authenticator code<input name="code" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" /></label>
          <div><button type="submit">Sign in as reviewer</button></div>
        </form>
      )}
    </div>
  );
}
