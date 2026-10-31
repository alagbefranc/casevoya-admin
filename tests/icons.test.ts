import { readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { House, ICON_MAP, SPRITE } from "@/components/icons";

const root = path.resolve(import.meta.dirname, "..");
const sprite = readFileSync(path.join(root, "public", SPRITE), "utf8");

describe("branded icons", () => {
  it("has a sprite symbol for every mapped icon", () => {
    for (const name of new Set(Object.values(ICON_MAP))) expect(sprite, name).toContain(`<symbol id="i-${name}"`);
  });
  it("renders the sprite with currentColor and is hidden from assistive tech by default", () => {
    const html = renderToStaticMarkup(createElement(House, { className: "ic" }));
    expect(html).toContain(`href="${SPRITE}#i-home"`);
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('aria-hidden="true"');
  });
  it("no source file imports lucide-react any more", () => {
    expect(execSync("grep -rl lucide-react src || true", { cwd: root }).toString().trim()).toBe("");
    expect(readFileSync(path.join(root, "package.json"), "utf8")).not.toContain("lucide-react");
  });
});
