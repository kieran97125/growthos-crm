"use client";
import { useState } from "react";
import Link from "next/link";
import { DemoProvider } from "@/lib/demo/Provider";
import { createAppState } from "@/lib/demo/state";
import { AIProvider } from "@/lib/demo/AIConnection";
import { PreviewIdentity } from "@/lib/saas/CompanyProvider";
import type { WorkspaceView } from "@/components/crm/conversations/ConversationWorkspace";
import { ProductWorkspace } from "@/components/products/ProductWorkspace";
import { defaultProduct, type Product } from "@/lib/saas/products";
import { BRANDS, TEAM } from "@/components/crm/conversations/model";
const companies = [
  {
    id: "preview-aurora",
    name: "Aurora Wellness",
    brandNames: ["Aurora Studio", "Aurora Care"],
  },
  {
    id: "preview-harbour",
    name: "Harbour Living",
    brandNames: ["Harbour Studio", "Harbour Care"],
  },
];
export default function Preview({
  view,
  contact,
  conversation,
  product,
  plan: initialPlan = "both",
}: {
  view: WorkspaceView;
  contact?: string;
  conversation?: string;
  product?: Product;
  plan?: string;
}) {
  const [createdAt] = useState(() => Date.now());
  const [plan, setPlan] = useState(
    ["crm", "pos", "both"].includes(initialPlan) ? initialPlan : "both",
  );
  const [requested, setRequested] = useState<Product>(
    product ?? (view === "pos" ? "pos" : "crm"),
  );
  const products: Product[] =
    plan === "both" ? ["crm", "pos"] : [plan as Product];
  const [companyId, setCompany] = useState(companies[0].id);
  const company = companies.find((c) => c.id === companyId)!;
  const scope = {
    companyId,
    companyName: company.name,
    brands: BRANDS.map((b, i) => ({ ...b, name: company.brandNames[i] })),
    team: [...TEAM],
  };
  const initial = createAppState(createdAt);
  initial.scope = scope;
  if (initial.pos) initial.pos.companyId = companyId;
  initial.inbox.contacts.forEach((c) => {
    c.clientId = companyId;
  });
  initial.inbox.conversations.forEach((c) => {
    c.clientId = companyId;
  });
  initial.studio.flows.forEach((f) => {
    f.clientId = companyId;
  });
  initial.studio.articles.forEach((a) => {
    a.clientId = companyId;
  });
  return (
    <div className="sv-preview-shell">
      <div className="sv-company-toolbar">
        <Link href="/login">← 登入</Link>
        <strong>示範工作空間</strong>
        <label>
          <span>示範公司</span>
          <select
            aria-label="切換示範公司"
            value={companyId}
            onChange={(e) => setCompany(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>體驗購買方案</span>
          <select
            aria-label="體驗購買方案"
            value={plan}
            onChange={(e) => {
              const next = e.target.value;
              setPlan(next);
              const products: Product[] =
                next === "both" ? ["crm", "pos"] : [next as Product];
              const preferred = defaultProduct(products)!;
              setRequested(preferred);
              window.history.replaceState(
                null,
                "",
                `/preview/${preferred}?plan=${next}`,
              );
            }}
          >
            <option value="both">CRM + POS</option>
            <option value="crm">只買 CRM</option>
            <option value="pos">只買 POS</option>
          </select>
        </label>
        <span>虛構資料 · 此瀏覽器儲存 · 未接真實渠道</span>
      </div>
      <PreviewIdentity
        key={`${companyId}:${plan}`}
        scope={scope}
        products={products}
      >
        <DemoProvider
          products={products}
          initialState={initial}
          storageKey={`smartvolt:preview:${companyId}:v1`}
        >
          <AIProvider>
            <ProductWorkspace
              initialProduct={requested}
              previewPlan={plan}
              initialView={view}
              initialContact={contact}
              initialConversation={conversation}
            />
          </AIProvider>
        </DemoProvider>
      </PreviewIdentity>
    </div>
  );
}
