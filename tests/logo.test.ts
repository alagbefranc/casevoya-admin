import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND, Logo } from "@/client/logo";

const root = path.resolve(import.meta.dirname, "..");

describe("brand logo", () => {
  it("ships every brand file in public/", () => {
    for (const src of Object.values(BRAND)) {
      const file = path.join(root, "public", src);
      expect(existsSync(file), src).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("<svg");
    }
  });
  it("uses the white wordmark on dark surfaces and the colour one on light", () => {
    const light = renderToStaticMarkup(createElement(Logo));
    expect(light).toContain(BRAND.wordmarkWhite);
    expect(light).toContain('alt="Casevoya"');
    expect(light).not.toContain("vo-mark");
    expect(renderToStaticMarkup(createElement(Logo, { tone: "dark" }))).toContain(`src="${BRAND.wordmark}"`);
  });
  it("adds the Vo mark for the collapsible sidebar", () => {
    const html = renderToStaticMarkup(createElement(Logo, { collapsible: true }));
    expect(html).toContain(BRAND.markWhite);
    expect(html.match(/alt="Casevoya"/g)).toHaveLength(2);
  });
  it("no longer renders the cv text tile", () => {
    for (const f of ["src/client/app.tsx", "src/client/setup.tsx"]) {
      expect(readFileSync(path.join(root, f), "utf8")).not.toMatch(/>cv</);
    }
  });
});
