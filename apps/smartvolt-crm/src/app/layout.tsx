import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { BRAND, BRAND_CSS } from "@/lib/brand";
import "./globals.css";
import "./saas.css";
export const metadata: Metadata = {
  title: BRAND.title,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  description: BRAND.description,
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
