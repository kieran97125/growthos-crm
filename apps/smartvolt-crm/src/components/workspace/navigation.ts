import type { Product } from "@/lib/saas/products";
export type CrmSection =
  | "inbox"
  | "customers"
  | "operations"
  | "flows"
  | "ai"
  | "knowledge"
  | "broadcasts"
  | "settings";
export const crmSections: { id: CrmSection; label: string; suffix: string }[] =
  [
    { id: "inbox", label: "收件匣", suffix: "/crm" },
    { id: "customers", label: "客戶", suffix: "/crm/customers" },
    { id: "operations", label: "跟進", suffix: "/crm/operations" },
    { id: "flows", label: "Flow", suffix: "/crm?view=flows" },
    { id: "ai", label: "AI 助理", suffix: "/crm/ai" },
    { id: "knowledge", label: "BOT／知識庫", suffix: "/crm?view=bot" },
    { id: "broadcasts", label: "推播", suffix: "/crm?view=broadcasts" },
    { id: "settings", label: "團隊與設定", suffix: "/settings" },
  ];
export function workspaceLocation(
  companyId: string,
  products: Product[],
  pathname: string,
  search: string,
) {
  const base = `/company/${companyId}`;
  const relative = pathname.startsWith(base + "/")
    ? pathname.slice(base.length)
    : "";
  const query = new URLSearchParams(search);
  const product: Product =
    (relative === "/copilot" && query.get("product") === "pos") ||
    /^\/(pos|ledger)(\/|$)/.test(relative) ||
    !products.includes("crm")
      ? "pos"
      : "crm";
  const view = query.get("view");
  let section: CrmSection = "inbox";
  if (
    relative.startsWith("/settings") ||
    relative === "/crm/meta" ||
    relative === "/crm/whatsapp"
  )
    section = "settings";
  else if (relative === "/crm/customers") section = "customers";
  else if (relative === "/crm/operations") section = "operations";
  else if (relative === "/crm/ai" || relative === "/copilot") section = "ai";
  else if (view === "flows") section = "flows";
  else if (view === "bot") section = "knowledge";
  else if (view === "broadcasts") section = "broadcasts";
  return { product, section, base, query };
}
