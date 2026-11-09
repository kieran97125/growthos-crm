import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Building2,
  CircleHelp,
  GitBranch,
  Home,
  Inbox,
  Layers3,
  Radio,
  Send,
  type LucideIcon,
} from "lucide-react";

type CrmSidebarKey =
  "home" | "inbox" | "campaigns" | "automations" | "system" | "settings";
const items: {
  key: CrmSidebarKey;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
}[] = [
  {
    key: "inbox",
    label: "業務收件匣",
    sub: "Inbox",
    href: "/crm",
    icon: Inbox,
  },
  {
    key: "campaigns",
    label: "受眾與推播",
    sub: "Campaigns",
    href: "/crm/campaigns",
    icon: Send,
  },
  {
    key: "automations",
    label: "跟進自動化",
    sub: "Workflows",
    href: "/crm/automations",
    icon: GitBranch,
  },
  {
    key: "system",
    label: "CRM 功能藍圖",
    sub: "Systems",
    href: "/crm/system",
    icon: Layers3,
  },
  {
    key: "settings",
    label: "渠道設定",
    sub: "Connections",
    href: "/crm/settings",
    icon: Radio,
  },
];
export function CrmShell({
  children,
  active = "inbox",
}: {
  children: ReactNode;
  active?: CrmSidebarKey;
}) {
  return (
    <main className="ops-shell">
      <aside className="ops-sidebar">
        <Link href="/" className="ops-brand" aria-label="Growth OS CRM 首頁">
          <span className="ops-brand-mark">
            <Building2 size={19} />
          </span>
          <span className="ops-sidebar-copy">
            <strong>FollowHub</strong>
            <small>GROWTH OS / CRM</small>
          </span>
        </Link>
        <div className="ops-sidebar-label">WORKSPACE</div>
        <nav aria-label="CRM 主導航">
          {items.map(({ key, label, sub, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
              title={label}
              className={active === key ? "is-active" : ""}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span className="ops-sidebar-copy">
                {label}
                <small>{sub}</small>
              </span>
              {active === key ? <span className="ops-nav-dot" /> : null}
            </Link>
          ))}
        </nav>
        <div className="ops-sidebar-bottom">
          <div className="ops-sidebar-caption">
            <CircleHelp size={17} />
            <span className="ops-sidebar-copy">讓每個查詢，有下一步。</span>
          </div>
          <Link href="/" title="CRM 首頁">
            <Home size={17} />
            <span className="ops-sidebar-copy">CRM 首頁</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      <section className="ops-main">{children}</section>
    </main>
  );
}
