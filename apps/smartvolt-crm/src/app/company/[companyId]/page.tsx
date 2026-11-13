import { CompanyProductPage } from "@/components/products/CompanyProductPage";
export const dynamic = "force-dynamic";
export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await params,
    query = await searchParams;
  return (
    <CompanyProductPage
      companyId={companyId}
      product={query.view === "pos" ? "pos" : undefined}
      query={query}
    />
  );
}
