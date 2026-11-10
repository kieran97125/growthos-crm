import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FollowHub · 客戶對話工作台",
  description:
    "獨立 CRM Demo：客服收件匣、WhatsApp Flow、AI 建議、推播及成效追蹤。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}
