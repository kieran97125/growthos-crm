"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useDemo } from "@/lib/demo/Provider";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import { defaultProduct, type Product } from "@/lib/saas/products";
import { StudioLoading } from "@/components/crm/studio/StudioUI";
import { ProductHeader, type CustomerContext } from "./ProductHeader";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
import "./products.css";
const CRM = lazy(() =>
  import("@/components/crm/conversations/ConversationWorkspace").then((m) => ({
    default: m.ConversationWorkspace,
  })),
);
const POS = lazy(() => import("@/components/pos/PosWorkspace"));
export function ProductWorkspace({
  initialProduct,
  initialView = "inbox",
  initialContact,
  initialConversation,
  previewPlan,
}: {
  initialProduct?: Product;
  initialView?: WorkspaceView;
  initialContact?: string;
  initialConversation?: string;
  previewPlan?: string;
}) {
  const { products, scope, connected } = useIdentity(),
    { state, ready } = useDemo();
  const preferred = defaultProduct(products),
    requested =
      initialProduct ?? (initialView === "pos" ? "pos" : (preferred ?? "crm"));
  const [product, setProduct] = useState<Product>(
    products.includes(requested) ? requested : (preferred ?? "crm"),
  );
  const [denied, setDenied] = useState<Product | null>(
    products.includes(requested) ? null : requested,
  );
  const [opened, setOpened] = useState<Product[]>(
    products.includes(requested) ? [requested] : [],
  );
  const initialBrand = state.inbox.conversations.find(
    (c) => c.contactId === initialContact,
  )?.brandId;
  const [posContext, setPosContext] = useState<CustomerContext | null>(
    initialContact
      ? { contactId: initialContact, brandId: initialBrand, token: "initial" }
      : null,
  );
  const [crmContext, setCrmContext] = useState<CustomerContext | null>(null);
  useEffect(() => {
    document.title = `SmartVolt ${product.toUpperCase()} · ${scope.companyName}`;
  }, [product, scope.companyName]);
  function switchProduct(next: Product, context?: CustomerContext) {
    if (!products.includes(next)) {
      setDenied(next);
      return;
    }
    setDenied(null);
    setProduct(next);
    setOpened((v) => (v.includes(next) ? v : [...v, next]));
    if (context?.contactId) {
      const request = { ...context, token: crypto.randomUUID() };
      if (next === "pos") setPosContext(request);
      else setCrmContext(request);
    }
    const path = connected
      ? `/company/${scope.companyId}/${next}`
      : `/preview/${next}?plan=${previewPlan ?? "both"}`;
    window.history.replaceState(null, "", path);
  }
  if (!preferred || denied)
    return (
      <div className="sv-products-denied">
        <LockKeyhole size={32} />
        <h1>
          {preferred
            ? `公司方案未包含 ${denied?.toUpperCase()}`
            : "公司未有可使用嘅產品方案"}
        </h1>
        <p>產品存取由公司購買方案及員工權限決定。</p>
        {preferred && (
          <button onClick={() => switchProduct(preferred)}>
            開啟 {preferred.toUpperCase()}
          </button>
        )}
      </div>
    );
  return (
    <div className="sv-products" data-product={product}>
      {products.includes("crm") && opened.includes("crm") && (
        <div className="sv-product-surface" hidden={product !== "crm"}>
          <Suspense fallback={<StudioLoading />}>
            <CRM
              initialView={initialView === "pos" ? "inbox" : initialView}
              initialConversation={initialConversation}
              requestedCustomer={crmContext}
              onSwitchProduct={switchProduct}
            />
          </Suspense>
        </div>
      )}
      {products.includes("pos") && opened.includes("pos") && ready && (
        <div
          className="sv-product-surface sv-pos-product"
          hidden={product !== "pos"}
        >
          <Suspense fallback={<StudioLoading />}>
            <POS
              active={product === "pos"}
              context={
                posContext?.contactId && posContext.brandId
                  ? {
                      contactId: posContext.contactId,
                      brandId: posContext.brandId,
                      token: posContext.token ?? "initial",
                    }
                  : null
              }
              renderProductHeader={(context) => (
                <ProductHeader
                  product="pos"
                  onSwitch={(next) => switchProduct(next, context)}
                />
              )}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
