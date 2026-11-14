import Link from "next/link";
import { readTeam } from "@/lib/team/server";
import { AccessError } from "@/lib/saas/identity";
import TeamSettings from "@/components/team/TeamSettings";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let team, error;
  try {
    team = await readTeam(companyId);
  } catch (e) {
    error = e instanceof AccessError ? e.message : "請稍後再試。";
  }
  if (!team)
    return (
      <main className="sv-picker">
        <h1>未能開啟團隊設定</h1>
        <p>{error}</p>
        <Link href={`/company/${companyId}/settings`}>返回公司設定</Link>
      </main>
    );
  return (
    <>
      <div style={{ maxWidth: 1040, margin: "24px auto 0", padding: "0 24px" }}>
        <Link href={`/company/${companyId}/settings`}>← 返回公司設定</Link>
      </div>
      <TeamSettings initial={team} />
    </>
  );
}
