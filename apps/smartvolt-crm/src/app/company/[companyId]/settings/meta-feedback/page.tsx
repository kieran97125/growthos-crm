import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { readFeedback } from "@/lib/feedback/server";
import FeedbackWorkspace from "@/components/feedback/FeedbackWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readFeedback(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟 Meta 成效回傳</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/settings`}>返回設定</Link>
      </main>
    );
  }
  return <FeedbackWorkspace companyId={companyId} initial={initial} />;
}
