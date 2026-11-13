import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import CustomerDirectory from "@/components/inquiries/CustomerDirectory";
export const dynamic = "force-dynamic";
export default async function CustomersPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let a;
  try {
    a = await requireCompany(companyId);
    requireProduct(a.products, "crm");
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟客戶目錄</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href="/">返回公司工作台</Link>
      </main>
    );
  }
  return (
    <CustomerDirectory
      companyId={companyId}
      companyName={a.company.name}
      hasPos={a.products.includes("pos")}
      canEdit={a.actor.role !== "viewer"}
    />
  );
}
