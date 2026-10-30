import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Runs scripts/check-boundaries.mjs (also run in CI by `pnpm verify`). */
describe("boundary check", () => {
  it("passes", () => {
    const out = execFileSync(process.execPath, [path.resolve(import.meta.dirname, "../scripts/check-boundaries.mjs")], { encoding: "utf8" });
    expect(out).toMatch(/Boundary check passed/);
  });
});
