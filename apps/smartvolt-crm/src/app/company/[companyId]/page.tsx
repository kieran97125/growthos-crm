import Link from "next/link";
import { redirect } from "next/navigation";
import { loadCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { CompanyProvider } from "@/lib/saas/CompanyProvider";
import { AIProvider } from "@/lib/demo/AIConnection";
import {
  ConversationWorkspace,
  type WorkspaceView,
} from "@/components/crm/conversations/ConversationWorkspace";
export const dynamic = "force-dynamic";
export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params;
  const query = await searchParams;
  let company;
  try {
    company = await loadCompany(companyId);
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    if (error instanceof AccessError)
      return (
        <main className="sv-picker">
          <h1>未能開啟工作空間</h1>
          <p role="alert">{error.message}</p>
          <Link href="/">返回公司列表</Link>
        </main>
      );
    throw error;
  }
  const view: WorkspaceView = [
    "inbox",
    "flows",
    "bot",
    "broadcasts",
    "pos",
  ].includes(query.view ?? "")
    ? (query.view as WorkspaceView)
    : "inbox";
  return (
    <CompanyProvider
      state={company.state}
      revision={company.revision}
      actor={company.actor}
    >
      <AIProvider>
        <ConversationWorkspace
          initialView={view}
          initialContact={query.contact}
          initialConversation={query.conversation}
        />
      </AIProvider>
    </CompanyProvider>
  );
}
