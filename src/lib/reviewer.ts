import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminContext } from "./guard";
import { SessionError, clearSession, sessionStatus, signIn, signOut, userSessionClient } from "./session";

/**
 * The template screens' view of the admin's own session (see ./session.ts). Kept so the existing server actions
 * read the same; the cookie and the sign-in are shared with /api/admin/session/*.
 */
export class ReviewerError extends Error {}

function wrap(error: unknown): never {
  if (error instanceof SessionError) throw new ReviewerError(error.message);
  throw error;
}

export async function clearReviewerSession(): Promise<void> {
  await clearSession();
}

export async function peekReviewerSession(admin: AdminContext): Promise<{ userId: string; aal: string | null; expiresAt: number | null } | null> {
  const status = await sessionStatus(admin);
  return status.signedIn && status.userId ? { userId: status.userId, aal: status.aal, expiresAt: status.expiresAt } : null;
}

export async function signInReviewer(admin: AdminContext, password: string, code: string): Promise<void> {
  try {
    await signIn(admin, password, code);
  } catch (error) {
    wrap(error);
  }
}

export async function asReviewer<T>(admin: AdminContext, code: string, fn: (client: SupabaseClient) => Promise<T>): Promise<T> {
  let client: SupabaseClient;
  try {
    ({ client } = await userSessionClient(admin, code));
  } catch (error) {
    wrap(error);
  }
  return fn(client);
}

export async function signOutReviewer(admin: AdminContext): Promise<void> {
  await signOut(admin);
}
