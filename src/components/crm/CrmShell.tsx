import Link from "next/link";
import type { ReactNode } from "react";

type CrmSidebarKey =
  | "home"
  | "inbox"
  | "contacts"
  | "bookings"
  | "quick-replies"
  | "ai-assist"
  | "brand-knowledge"
  | "reports"
  | "settings";

const sidebarItems: Array<{
  key: CrmSidebarKey;
  label: string;
  href: string;
  enabled: boolean;
}> = [
  { key: "home", label: "Home", href: "/", enabled: true },
  { key: "inbox", label: "Inbox", href: "/crm", enabled: true },
  { key: "contacts", label: "Contacts", href: "/crm", enabled: false },
  { key: "bookings", label: "Bookings", href: "/crm", enabled: false },
  { key: "quick-replies", label: "Quick Replies", href: "/crm", enabled: false },
  { key: "ai-assist", label: "AI Assist", href: "/crm", enabled: false },
  { key: "brand-knowledge", label: "Brand Knowledge", href: "/crm", enabled: false },
  { key: "reports", label: "Reports", href: "/crm", enabled: false },
  { key: "settings", label: "Settings", href: "/crm/settings", enabled: true },
];

export function CrmShell({
  children,
  active = "inbox",
}: {
  children: ReactNode;
  active?: CrmSidebarKey;
}) {
  return (
    <main className="min-h-screen bg-[#f5f6f8] text-[#1f2933]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[208px] shrink-0 border-r border-[#dfe4ea] bg-[#111827] text-white lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9ca3af]">
              Growth OS
            </p>
            <h1 className="mt-1 text-base font-bold">FollowHub CRM</h1>
          </div>
          <nav className="flex-1 space-y-1 px-2.5 py-3">
            {sidebarItems.map((item) =>
              item.enabled ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold transition ${
                    item.key === active
                      ? "bg-white text-[#111827]"
                      : "text-[#d1d5db] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  className="flex h-9 cursor-not-allowed items-center justify-between rounded-lg px-3 text-[13px] font-semibold text-[#6b7280]"
                >
                  {item.label}
                  <span className="text-[9px] uppercase tracking-[0.12em] text-[#4b5563]">
                    Soon
                  </span>
                </span>
              )
            )}
          </nav>
          <div className="border-t border-white/10 p-2.5">
            <Link
              href="/"
              className="block rounded-lg px-3 py-2 text-[12px] font-semibold text-[#d1d5db] transition hover:bg-white/10 hover:text-white"
            >
              CRM Home
            </Link>
          </div>
        </aside>

        <aside className="flex w-[64px] shrink-0 flex-col items-center border-r border-[#dfe4ea] bg-[#111827] py-3 text-white lg:hidden">
          <Link
            href="/crm"
            className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[12px] font-black text-[#111827]"
            title="CRM Inbox"
          >
            C
          </Link>
          <div className="mt-4 grid gap-2">
            {["In", "Ct", "Bk", "QR", "AI"].map((label, index) => (
              <span
                key={label}
                className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold ${
                  index === 0 ? "bg-white text-[#111827]" : "bg-white/8 text-[#9ca3af]"
                }`}
                title={index === 0 ? "Inbox" : "Coming soon"}
              >
                {label}
              </span>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </main>
  );
}
