import { redirect } from "next/navigation";
import Link from "next/link";
import { companyAIStatus } from "@/lib/ai/server";
import { AccessError } from "@/lib/saas/identity";
import AIStudio from "@/components/ai/AIStudio";
import CopilotWorkspace from "@/components/copilot/CopilotWorkspace";
import { requireCompany } from "@/lib/saas/server";
import { requireProduct } from "@/lib/saas/products";
import "@/components/ai/ai.css";
import { coachingSource } from "@/lib/coaching/model";
export const dynamic = "force-dynamic";
export default async function AIPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    mode?: string;
    brand?: string;
    coachSource?: string;
    coachId?: string;
  }>;
}) {
  const { companyId } = await params;
  let status;
  const query = await searchParams;
  const replies = query.mode === "replies";
  const source = coachingSource.safeParse(query.coachSource);
  try {
    const access = await requireCompany(companyId);
    requireProduct(access.products, "crm");
    if (replies) status = await companyAIStatus(companyId);
  } catch (e) {
    if (e instanceof AccessError && e.status === 401) redirect("/login");
    return (
      <main className="sv-picker">
        <h1>未能開啟 AI 工作室</h1>
        <p>{e instanceof AccessError ? e.message : "請稍後再試。"}</p>
        <Link href="/">返回公司工作台</Link>
      </main>
    );
  }
  return status ? (
    <AIStudio
      companyId={companyId}
      initialStatus={status}
      initialBrand={query.brand}
      initialCoaching={
        source.success && query.coachId && query.coachId.length <= 100
          ? { source: source.data, sourceId: query.coachId }
          : undefined
      }
    />
  ) : (
    <CopilotWorkspace />
  );
}
