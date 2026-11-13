"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  ChevronDown,
  Inbox,
  LogOut,
  MessagesSquare,
  Send,
  Settings2,
  Store,
  UsersRound,
  Workflow,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import type { Product } from "@/lib/saas/products";
import { WorkspaceChromeContext, type WorkspaceCustomer } from "./context";
import { crmSections, workspaceLocation } from "./navigation";
import {
  CopilotProvider,
  CLauncher,
  CHeaderButton,
} from "@/components/copilot/CopilotProvider";
type Props = {
  companyId: string;
  companyName: string;
  actorName: string;
  actorId?: string;
  products: Product[];
  children: ReactNode;
};
const icons = {
  inbox: Inbox,
  customers: UsersRound,
  flows: Workflow,
  ai: Bot,
  knowledge: BookOpen,
  broadcasts: Send,
  settings: Settings2,
};

/** One company shell owns identity and navigation; modules own their work area. */
export function CompanyWorkspaceChrome({
  companyId,
  companyName,
  actorName,
  actorId,
  products,
  children,
  location,
  navigate,
}: Props & {
  location: { pathname: string; search: string };
  navigate?: (href: string) => void;
}) {
  const current = workspaceLocation(
    companyId,
    products,
    location.pathname,
    location.search,
  );
  const [customers, setCustomers] = useState<
    Partial<Record<Product, WorkspaceCustomer | null>>
  >({});
  const publishCustomer = useCallback(
    (product: Product, customer: WorkspaceCustomer | null) => {
      setCustomers((old) =>
        old[product]?.contactId === customer?.contactId &&
        old[product]?.brandId === customer?.brandId
          ? old
          : { ...old, [product]: customer },
      );
    },
    [],
  );
  const other = current.product === "crm" ? "pos" : "crm";
  const activeCustomer = customers[current.product];
  const contactId = activeCustomer?.contactId ?? current.query.get("contact");
  const brandId = activeCustomer?.brandId ?? current.query.get("brand");
  const context = new URLSearchParams({
    ...(contactId ? { contact: contactId } : {}),
    ...(brandId ? { brand: brandId } : {}),
  }).toString();
  const showCrmRail = current.product === "crm" && products.includes("crm");
  const chrome = useMemo(
    () => ({ publishCustomer, navigate }),
    [publishCustomer, navigate],
  );
  return (
    <CopilotProvider
      key={`${companyId}:${actorId ?? actorName}:${current.product}`}
      companyId={companyId}
      identityKey={actorId ?? actorName}
      context={{
        product: current.product,
        section: current.section,
        activity: "viewing",
        customerId: contactId ?? undefined,
        brandId: brandId ?? undefined,
      }}
    >
      <WorkspaceChromeContext.Provider value={chrome}>
        <div
          className="cq-workspace"
          data-product={current.product}
          data-rail={showCrmRail}
        >
          <a className="cq-skip" href="#company-work-area">
            跳到工作區
          </a>
          <header className="cq-header">
            <div className="cq-brand">
              <CLauncher />
              <Link
                href={`${current.base}/${current.product}`}
                aria-label={`${BRAND.name} ${current.product.toUpperCase()}`}
              >
                <strong>{BRAND.name}</strong>
              </Link>
            </div>
            <span className="cq-product">
              {current.product === "crm" ? (
                <MessagesSquare size={15} />
              ) : (
                <Store size={15} />
              )}
              <b>{current.product.toUpperCase()}</b>
            </span>
            <span className="cq-company">{companyName}</span>
            <div className="cq-header-actions">
              <CHeaderButton />
              {products.includes(other) && (
                <Link
                  className="cq-switch"
                  href={`${current.base}/${other}${context ? "?" + context : ""}`}
                  aria-label={`切換至 ${other.toUpperCase()}`}
                >
                  <ArrowLeftRight size={16} />
                  <span>切換 {other.toUpperCase()}</span>
                </Link>
              )}
              <details
                className="cq-account"
                key={location.pathname + location.search}
              >
                <summary aria-label="公司及帳戶選單">
                  <span>{actorName.slice(0, 1)}</span>
                  <ChevronDown size={13} />
                </summary>
                <div className="cq-account-menu">
                  <b>{actorName}</b>
                  <small>{companyName}</small>
                  <Link href={`${current.base}/settings`}>
                    <Settings2 size={15} />
                    公司設定
                  </Link>
                  <Link href="/">
                    <UsersRound size={15} />
                    切換公司
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button>
                      <LogOut size={15} />
                      登出
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </header>
          {showCrmRail && (
            <nav className="cq-rail" aria-label="CRM 功能">
              {crmSections.map((item) => {
                const Icon = icons[item.id];
                return (
                  <Link
                    key={item.id}
                    data-section={item.id}
                    href={current.base + item.suffix}
                    aria-current={
                      current.section === item.id ? "page" : undefined
                    }
                    title={item.label}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="cq-content" id="company-work-area" tabIndex={-1}>
            {children}
          </div>
        </div>
      </WorkspaceChromeContext.Provider>
    </CopilotProvider>
  );
}
export default function CompanyWorkspace(props: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const navigate = useCallback((href: string) => router.push(href), [router]);
  return (
    <CompanyWorkspaceChrome
      {...props}
      navigate={navigate}
      location={{ pathname, search: search.toString() }}
    />
  );
}
