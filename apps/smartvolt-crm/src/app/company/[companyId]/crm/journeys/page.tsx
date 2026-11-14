import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError } from "@/lib/saas/identity";
import { readEngagement } from "@/lib/engagement/server";
import { readJourneys } from "@/lib/engagement/journeys-server";
import JourneyWorkspace from "@/components/engagement/JourneyWorkspace";
export const dynamic = "force-dynamic";
export default async function JourneysPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial, engagement;
  try {
    [initial, engagement] = await Promise.all([
      readJourneys(companyId, {}),
      readEngagement(companyId, {}),
    ]);
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟自動追客</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/crm`}>返回收件匣</Link>
      </main>
    );
  }
  return (
    <JourneyWorkspace
      companyId={companyId}
      initial={initial}
      engagement={engagement}
    />
  );
}
