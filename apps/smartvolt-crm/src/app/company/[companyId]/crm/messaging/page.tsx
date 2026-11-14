import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError } from "@/lib/saas/identity";
import { readEngagement } from "@/lib/engagement/server";
import EngagementWorkspace from "@/components/engagement/EngagementWorkspace";
export const dynamic = "force-dynamic";
export default async function MessagingPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readEngagement(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟客戶訊息</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/crm`}>返回收件匣</Link>
      </main>
    );
  }
  return <EngagementWorkspace companyId={companyId} initial={initial} />;
}
