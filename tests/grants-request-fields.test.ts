import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The request-access drawer must send the field names POST /support/requests validates.
describe("request-access drawer payload", () => {
  const src = readFileSync("src/client/grants.tsx", "utf8");
  it("sends requesterName and requesterEmail", () => {
    expect(src).toContain("requesterName: name.trim()");
    expect(src).toContain("requesterEmail: email.trim() || null");
    expect(src).not.toMatch(/requestedBy(Name|Email)/);
  });
});
