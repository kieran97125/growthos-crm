import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { BRAND, BRAND_CSS } from "@/lib/brand";
import "./globals.css";
export const metadata: Metadata = {
  title: BRAND.title,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  description:
    "獨立 CRM Demo：客服收件匣、WhatsApp Flow、AI 建議、推播及成效追蹤。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: BRAND.colors.royal };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-HK">
      <body style={BRAND_CSS as CSSProperties}>{children}</body>
    </html>
  );
}
