import { BRAND, BRAND_MARK } from "@/lib/brand";

/** Shared vector for the workspace, browser icon and home-screen identity. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path fill={BRAND.colors.royal} d="M0 0H40V40H0Z" />
      <path fill="white" d={BRAND_MARK.body} />
      <circle cx="30" cy="20" r="2.5" fill={BRAND.colors.silverLight} />
    </svg>
  );
}
