import Link from "next/link";
import UnifiedInbox from "@/components/inquiries/UnifiedInbox";
import { redirect } from "next/navigation";
import { loadCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { defaultProduct, type Product } from "@/lib/saas/products";
import { CompanyProvider } from "@/lib/saas/CompanyProvider";
import { AIProvider } from "@/lib/demo/AIConnection";
import { ProductWorkspace } from "./ProductWorkspace";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
export async function CompanyProductPage({
  companyId,
  product,
  query,
}: {
  companyId: string;
  product?: Product;
  query: Record<string, string | undefined>;
}) {
  let company;
  try {
    company = await loadCompany(
      companyId,
      product,
      product === "pos" ? query.contact : undefined,
    );
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    if (error instanceof AccessError)
      return (
        <main className="sv-picker">
          <h1>未能開啟產品工作空間</h1>
          <p role="alert">{error.message}</p>
          <Link href={`/company/${companyId}`}>返回公司工作空間</Link>
        </main>
      );
    throw error;
  }
  const selected = product ?? defaultProduct(company.products)!;
  const view: WorkspaceView = ["inbox", "flows", "bot", "broadcasts"].includes(
    query.view ?? "",
  )
    ? (query.view as WorkspaceView)
    : "inbox";
  if (selected === "crm" && view === "inbox")
    return (
      <UnifiedInbox
        companyId={companyId}
        companyName={company.company.name}
        hasPos={company.products.includes("pos")}
        initialThread={query.thread}
        initialProvider={query.provider}
        initialCustomer={query.contact}
      />
    );
  return (
    <>
      {selected === "crm" && (
        <nav className="sv-live-channels" aria-label="正式通訊渠道">
          <Link href={`/company/${companyId}/crm/ai`}>AI 回覆工作室 →</Link>
          <Link href={`/company/${companyId}/crm/meta`}>
            Messenger／Instagram 收件匣 →
          </Link>
          <Link href={`/company/${companyId}/crm/whatsapp`}>
            WhatsApp 收件匣 →
          </Link>
        </nav>
      )}
      <CompanyProvider
        state={company.state}
        revision={company.revision}
        actor={company.actor}
        products={company.products}
      >
        <AIProvider>
          <ProductWorkspace
            initialProduct={selected}
            initialView={view}
            initialContact={query.contact}
            initialBrand={query.brand}
            initialConversation={query.conversation}
          />
        </AIProvider>
      </CompanyProvider>
    </>
  );
}
