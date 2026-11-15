import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { readRoster } from "@/lib/operations/roster-server";
import RosterWorkspace from "@/components/operations/RosterWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readRoster(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟派客設定</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/settings`}>返回設定</Link>
      </main>
    );
  }
  return <RosterWorkspace companyId={companyId} initial={initial} />;
}
