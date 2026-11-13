import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import OperationsWorkspace from "@/components/operations/OperationsWorkspace";
export const dynamic = "force-dynamic";
export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { companyId } = await params;
  let actorId: string;
  try {
    const a = await requireCompany(companyId);
    requireProduct(a.products, "crm");
    actorId = a.user.id;
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟營運工作台</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href="/">返回公司工作台</Link>
      </main>
    );
  }
  const q = await searchParams;
  const initialTab =
    q.tab === "followups" || q.tab === "team" || q.tab === "rules"
      ? q.tab
      : "pipeline";
  return (
    <OperationsWorkspace
      companyId={companyId}
      actorId={actorId}
      initialTab={initialTab}
    />
  );
}
