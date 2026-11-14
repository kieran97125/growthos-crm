import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { readNotifications } from "@/lib/notifications/server";
import NotificationWorkspace from "@/components/notifications/NotificationWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readNotifications(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能讀取提醒</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/crm`}>返回收件匣</Link>
      </main>
    );
  }
  return <NotificationWorkspace companyId={companyId} initial={initial} />;
}
