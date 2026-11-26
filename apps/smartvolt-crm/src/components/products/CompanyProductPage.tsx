import Link from "next/link";
import InboxChannels from "@/components/inquiries/InboxChannels";
import { readChatReadiness } from "@/lib/web-chat/server";
import type { WebChatReadiness } from "@/lib/web-chat/model";
import { redirect } from "next/navigation";
import { loadCompany, requireCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import {
  defaultProduct,
  requireProduct,
  type Product,
} from "@/lib/saas/products";
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
  const view: WorkspaceView = ["inbox", "flows", "bot", "broadcasts"].includes(
    query.view ?? "",
  )
    ? (query.view as WorkspaceView)
    : "inbox";
  let company;
  let access;
  let websiteReadiness: WebChatReadiness = "unavailable";
  try {
    access = await requireCompany(companyId);
    const selected = product ?? defaultProduct(access.products);
    if (selected === "crm" && view === "inbox") {
      requireProduct(access.products, "crm");
      websiteReadiness = await readChatReadiness(companyId);
      if (websiteReadiness !== "ready" && query.provider === "website") {
        const clean = new URLSearchParams();
        for (const [key, value] of Object.entries(query))
          if (
            value !== undefined &&
            !["provider", "thread", "contact", "queue"].includes(key)
          )
            clean.set(key, value);
        redirect(
          `/company/${companyId}/crm${clean.size ? "?" + clean.toString() : ""}`,
        );
      }
    } else
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
  if (!company)
    return (
      <InboxChannels
        key={`${companyId}:${access.user.id}`}
        actorId={access.user.id}
        websiteReadiness={websiteReadiness}
        companyId={companyId}
        companyName={access.company.name}
        hasPos={access.products.includes("pos")}
        initialThread={query.thread}
        initialProvider={query.provider}
        initialCustomer={query.contact}
        initialQueue={query.queue}
      />
    );
  const selected = product ?? defaultProduct(company.products)!;
  if (selected === "crm" && view === "inbox")
    return (
      <InboxChannels
        key={`${companyId}:${access.user.id}`}
        actorId={access.user.id}
        websiteReadiness={websiteReadiness}
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
            initialBotTab={query.rules === "1" ? "settings" : "knowledge"}
            initialContact={query.contact}
            initialBrand={query.brand}
            initialConversation={query.conversation}
          />
        </AIProvider>
      </CompanyProvider>
    </>
  );
}
