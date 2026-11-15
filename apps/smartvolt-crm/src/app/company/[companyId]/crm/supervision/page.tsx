import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError } from "@/lib/saas/identity";
import { readSupervision } from "@/lib/operations/supervision-server";
import SupervisionWorkspace from "@/components/operations/SupervisionWorkspace";
export const dynamic = "force-dynamic";
export default async function SupervisionPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let initial;
  try {
    initial = await readSupervision(companyId, {});
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟主管工作台</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href={"/company/" + companyId + "/crm/operations"}>
          返回跟進工作台
        </Link>
      </main>
    );
  }
  return <SupervisionWorkspace companyId={companyId} initial={initial} />;
}
