import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";

export function generateImageMetadata() {
  return [32, 192, 512].map((size) => ({
    id: `${size}-${BRAND.iconVersion}`,
    size: { width: size, height: size },
    contentType: "image/png",
    alt: BRAND.name,
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const value = await id;
  const requested = Number.parseInt(value, 10);
  const size = requested === 512 ? 512 : requested === 192 ? 192 : 32;
  return new ImageResponse(<BrandMark size={size} rounded={size === 32} />, {
    width: size,
    height: size,
  });
}
