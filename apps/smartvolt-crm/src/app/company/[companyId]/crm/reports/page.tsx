import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { readReports } from "@/lib/reports/server";
import ReportsWorkspace from "@/components/reports/ReportsWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readReports(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟成效報表</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/crm/operations`}>
          返回跟進工作台
        </Link>
      </main>
    );
  }
  return <ReportsWorkspace companyId={companyId} initial={initial} />;
}
