import { BRAND, BRAND_MARK } from "@/lib/brand";

/** Shared vector for the workspace, browser icon and home-screen identity. */
export function BrandMark({
  size = 40,
  rounded = true,
}: {
  size?: number;
  rounded?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect
        width="40"
        height="40"
        rx={rounded ? 11 : 0}
        fill={BRAND.colors.accent}
      />
      <path fill={BRAND.colors.onAccent} d={BRAND_MARK.body} />
      <circle cx="30" cy="20" r="2.5" fill={BRAND.colors.onAccent} />
    </svg>
  );
}
