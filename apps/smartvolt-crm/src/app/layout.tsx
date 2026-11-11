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
    "SmartVolt：獨立 CRM 與 POS 產品，按公司方案使用客戶營運、對話、預約、收銀與套票。",
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
