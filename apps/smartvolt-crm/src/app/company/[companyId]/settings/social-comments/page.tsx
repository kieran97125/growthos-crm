import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { readSocialComments } from "@/lib/social-comments/server";
import SocialCommentsWorkspace from "@/components/social-comments/SocialCommentsWorkspace";
export const dynamic = "force-dynamic";
export default async function SocialCommentsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readSocialComments(companyId);
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟留言私訊</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={`/company/${companyId}/settings`}>返回設定</Link>
      </main>
    );
  }
  return <SocialCommentsWorkspace companyId={companyId} initial={initial} />;
}
