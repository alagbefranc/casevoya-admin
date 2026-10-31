// Bindings this Worker declares in wrangler.jsonc, added to OpenNext's global CloudflareEnv
// (getCloudflareContext().env). Optional: they are absent in tests and `next dev`.

/** Workers Rate Limiting binding ("ratelimits" in wrangler.jsonc). */
interface WorkersRateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    ADMIN_API_READ?: WorkersRateLimit;
    ADMIN_API_WRITE?: WorkersRateLimit;
    ADMIN_SENSITIVE?: WorkersRateLimit;
    ADMIN_SETUP?: WorkersRateLimit;
  }
}

export {};
