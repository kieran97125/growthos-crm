import Link from "next/link";
import { readChatSettings } from "@/lib/web-chat/server";
import { AccessError } from "@/lib/saas/identity";
import WebChatSettings from "@/components/web-chat/WebChatSettings";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let settings, error;
  try {
    settings = await readChatSettings(companyId);
  } catch (e) {
    error = e instanceof AccessError ? e.message : "請稍後再試。";
  }
  if (!settings)
    return (
      <main className="sv-picker">
        <h1>未能開啟網站聊天設定</h1>
        <p>{error}</p>
        <Link href={`/company/${companyId}/settings`}>返回公司設定</Link>
      </main>
    );
  return (
    <>
      <div className="wc-back">
        <Link href={`/company/${companyId}/settings`}>← 返回公司設定</Link>
      </div>
      <WebChatSettings initial={settings} />
    </>
  );
}
