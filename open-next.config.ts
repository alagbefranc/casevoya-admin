import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No R2 or KV binding: every admin page is dynamic and must never be cached.
export default defineCloudflareConfig({});
