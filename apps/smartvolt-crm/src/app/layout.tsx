import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { BRAND, BRAND_CSS } from "@/lib/brand";
import "./globals.css";
import "./saas.css";
export const metadata: Metadata = {
  title: BRAND.title,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  description:
    "SmartVolt CRM：公司專屬客戶工作空間、團隊收件匣、Flow、AI BOT 及推播成效。",
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
