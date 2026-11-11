import { notFound } from "next/navigation";
import Preview from "../Preview";
import { productSchema } from "@/lib/saas/products";
export default async function PreviewProduct({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>;
  searchParams: Promise<{
    plan?: string;
    contact?: string;
    conversation?: string;
  }>;
}) {
  const p = productSchema.safeParse((await params).product);
  if (!p.success) notFound();
  const q = await searchParams;
  return (
    <Preview
      product={p.data}
      view={p.data === "pos" ? "pos" : "inbox"}
      plan={q.plan}
      contact={q.contact}
      conversation={q.conversation}
    />
  );
}
