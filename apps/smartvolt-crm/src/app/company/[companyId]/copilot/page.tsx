import { requireCompany } from "@/lib/saas/server";
import { requireProduct, defaultProduct } from "@/lib/saas/products";
import CopilotWorkspace from "@/components/copilot/CopilotWorkspace";
export default async function CopilotPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { companyId } = await params,
    access = await requireCompany(companyId),
    query = await searchParams;
  const product =
    query.product === "pos"
      ? "pos"
      : query.product === "crm"
        ? "crm"
        : defaultProduct(access.products);
  if (product) requireProduct(access.products, product);
  return <CopilotWorkspace />;
}
