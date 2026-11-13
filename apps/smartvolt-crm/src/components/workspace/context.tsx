"use client";
import { createContext, useContext, useEffect } from "react";
import type { Product } from "@/lib/saas/products";
export type WorkspaceCustomer = { contactId?: string; brandId?: string };
export const WorkspaceChromeContext = createContext<{
  navigate?: (href: string) => void;
  publishCustomer: (
    product: Product,
    customer: WorkspaceCustomer | null,
  ) => void;
} | null>(null);
export const useWorkspaceChrome = () => useContext(WorkspaceChromeContext);

/** Product-owned customer context survives an explicit CRM/POS switch. */
export function useWorkspaceCustomer(
  product: Product,
  customer?: WorkspaceCustomer,
) {
  const chrome = useWorkspaceChrome();
  const publish = chrome?.publishCustomer;
  const contactId = customer?.contactId,
    brandId = customer?.brandId;
  useEffect(() => {
    if (!publish) return;
    publish(product, contactId ? { contactId, brandId } : null);
    return () => publish(product, null);
  }, [publish, product, contactId, brandId]);
}
