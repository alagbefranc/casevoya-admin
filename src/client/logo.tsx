// The real Casevoya brand (files in public/assets/brand, copied from the main app's public/assets/brand).
// tone "light" = white artwork for dark surfaces (sidebar, top bar, mobile drawer);
// tone "dark" = colour artwork for light surfaces (full-page session and setup cards).
// collapsible = also render the Vo mark, which CSS shows instead of the wordmark when the rail is collapsed.
export const BRAND = {
  wordmark: "/assets/brand/casevoya-wordmark.svg",
  wordmarkWhite: "/assets/brand/casevoya-wordmark-white.svg",
  mark: "/assets/brand/vo-mark.svg",
  markWhite: "/assets/brand/vo-mark-white.svg",
} as const;

export function Logo({ tone = "light", collapsible = false }: { tone?: "light" | "dark"; collapsible?: boolean }) {
  const light = tone === "light";
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG brand asset */}
      <img className="logo logo-word" src={light ? BRAND.wordmarkWhite : BRAND.wordmark} alt="Casevoya" width={110} height={18} />
      {collapsible ? (
        // eslint-disable-next-line @next/next/no-img-element -- static SVG brand asset
        <img className="logo logo-mark" src={light ? BRAND.markWhite : BRAND.mark} alt="Casevoya" width={36} height={15} />
      ) : null}
    </>
  );
}
