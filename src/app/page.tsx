import Link from "next/link";

const appCards = [
  {
    href: "/crm",
    title: "Open CRM Inbox",
    body: "Full-screen LeadOps workspace for WhatsApp-first follow-up, source context, booking intent and payment outcome.",
  },
  {
    href: "/crm/settings",
    title: "WhatsApp Settings",
    body: "Read-only channel foundation for WABA, phone number, templates, webhooks and token security boundaries.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f5f6f8] px-5 py-10 text-[#111827]">
      <section className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[32px] border border-[#dfe4ea] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.10)]">
          <div className="border-b border-[#eef2f6] bg-[#111827] px-6 py-5 text-white">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9ca3af]">
              Growth OS CRM
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              FollowHub CRM
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-[#d1d5db] md:text-base">
              WhatsApp-first CRM for CS operations, lead follow-up, booking
              intent, payment outcome and source-linked customer context.
            </p>
          </div>

          <div className="grid gap-5 p-6 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-[#dfe4ea] bg-[#f8fafc] p-5">
              <h2 className="text-lg font-black">Standalone CRM workspace</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
                This app is intentionally separated from the Growth OS platform
                shell so the CRM can use a dense inbox layout: dark sidebar,
                compact metrics, filters, lead table, and dedicated lead detail
                pages.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/crm"
                  className="rounded-md bg-[#111827] px-4 py-3 text-sm font-black text-white transition hover:bg-[#1f2937]"
                >
                  Open CRM
                </Link>
                <Link
                  href="/crm/settings"
                  className="rounded-md border border-[#dfe4ea] bg-white px-4 py-3 text-sm font-black text-[#111827] transition hover:bg-[#f8fafc]"
                >
                  Settings
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                Safety boundary
              </p>
              <ul className="mt-3 grid gap-2 text-sm font-semibold leading-6 text-amber-900">
                <li>CRM write mode stays disabled unless deliberately enabled.</li>
                <li>No WhatsApp API calls or send-message endpoints are included.</li>
                <li>Raw source snapshot payloads and token values are not shown.</li>
              </ul>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[#eef2f6] p-6 md:grid-cols-2">
            {appCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="block rounded-2xl border border-[#dfe4ea] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                <h2 className="text-base font-black text-[#111827]">{card.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
                  {card.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
