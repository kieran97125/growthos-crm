import { notFound } from "next/navigation";
import { productSchema } from "@/lib/saas/products";
import { CompanyProductPage } from "@/components/products/CompanyProductPage";
export const dynamic = "force-dynamic";
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; product: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await params,
    product = productSchema.safeParse(p.product);
  if (!product.success) notFound();
  return (
    <CompanyProductPage
      companyId={p.companyId}
      product={product.data}
      query={await searchParams}
    />
  );
}
