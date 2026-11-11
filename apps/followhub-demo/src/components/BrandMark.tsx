import { BRAND, K_MARK } from "@/lib/brand";

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
      <path fill="white" d={K_MARK.stem} />
      <path fill={BRAND.colors.silverLight} d={K_MARK.upper} />
      <path fill="white" d={K_MARK.lower} />
    </svg>
  );
}
