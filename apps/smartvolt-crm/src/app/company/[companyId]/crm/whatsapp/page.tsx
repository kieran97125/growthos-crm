import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import { AccessError } from "@/lib/saas/identity";
import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox";
import "@/components/whatsapp/whatsapp.css";

export const dynamic = "force-dynamic";
export default async function WhatsAppInboxPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let access;
  try {
    access = await requireCompany(companyId);
    requireProduct(access.products, "crm");
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    return (
      <main className="sv-picker">
        <h1>暫時未能進入 WhatsApp 收件箱</h1>
        <p>{error instanceof AccessError ? error.message : "請稍後再試。"}</p>
        <Link href="/">返回公司工作台</Link>
      </main>
    );
  }
  return (
    <WhatsAppInbox
      key={companyId}
      companyId={companyId}
      companyName={access.company.name}
      canSend={access.actor.role !== "viewer"}
      canManage={access.actor.role === "owner"}
    />
  );
}
