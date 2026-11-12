"use client";
import { ArrowLeftRight, MessagesSquare, Store } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";
import { useIdentity } from "@/lib/saas/CompanyProvider";
import type { Product } from "@/lib/saas/products";
export type CustomerContext = {
  contactId?: string;
  brandId?: string;
  token?: string;
};
export function ProductHeader({
  product,
  onSwitch,
}: {
  product: Product;
  onSwitch: (product: Product) => void;
}) {
  const identity = useIdentity(),
    other = product === "crm" ? "pos" : "crm";
  const Icon = other === "pos" ? Store : MessagesSquare;
  return (
    <header className="sv-product-header fh-topbar">
      <a
        className="sv-product-wordmark"
        href={
          identity.connected
            ? `/company/${identity.scope.companyId}/${product}`
            : `/preview/${product}?plan=${identity.products.length === 2 ? "both" : (identity.products[0] ?? "none")}`
        }
        aria-label={`${BRAND.name} ${product.toUpperCase()}`}
      >
        <span>
          <BrandMark />
        </span>
        <strong>{BRAND.name}</strong>
      </a>
      <span className={`sv-current-product is-${product}`}>
        {product === "crm" ? <MessagesSquare size={16} /> : <Store size={16} />}
        <strong>{product.toUpperCase()}</strong>
      </span>
      <div className="fh-workspace-name sv-product-company">
        <i />
        {identity.scope.companyName}
      </div>
      <div className="sv-product-header-right">
        <span className="sv-product-mode">
          {identity.connected ? "公司專屬工作空間" : "示範工作空間"}
        </span>
        {identity.products.includes(other) && (
          <button
            className="sv-product-switch"
            onClick={() => onSwitch(other)}
            aria-label={`切換至 ${other.toUpperCase()}`}
          >
            <ArrowLeftRight size={16} />
            <span>
              切換至 <b>{other.toUpperCase()}</b>
            </span>
            <Icon size={17} />
          </button>
        )}
        <span
          className="sv-product-operator"
          aria-label={`目前同事 ${identity.actor.name}`}
        >
          {identity.actor.name.slice(0, 1)}
        </span>
      </div>
    </header>
  );
}
