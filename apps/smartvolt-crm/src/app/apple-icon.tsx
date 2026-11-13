import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = BRAND.name;

export default function AppleIcon() {
  return new ImageResponse(
    <BrandMark size={size.width} rounded={false} />,
    size,
  );
}
