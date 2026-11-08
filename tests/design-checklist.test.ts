import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

describe("admin design checklist", () => {
  it("uses Source Sans 3 for body text and does not load Inter, Geist, or Space Grotesk", () => {
    expect(layout).toContain("Source_Sans_3");
    expect(layout).not.toMatch(/\bInter\b|Geist|Space_Grotesk|Space Grotesk|Space Grotesque|font-inter/);
    expect(css).toContain("Source Sans 3");
    expect(css).not.toMatch(/\bInter\b|Geist|Space Grotesk|Space Grotesque|font-inter/);
  });

  it("keeps full-page session screens on a flat paper background", () => {
    const rule = css.match(/\.full \{[^}]+\}/)?.[0] ?? "";
    expect(rule).toContain("background: var(--paper)");
    expect(rule).not.toContain("radial-gradient");
    expect(css).not.toContain("radial-gradient");
  });
});
