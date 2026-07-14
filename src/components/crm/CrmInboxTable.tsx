import Link from "next/link";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import type { CrmLeadCase } from "@/lib/crm/leadOps";

const headings = [
  "",
  "Last Activity",
  "Assigned to",
  "Contact",
  "Source",
  "CTWA Source ID",
  "Status",
  "Contact Created At",
  "Phone Number",
  "Email",
  "Tag",
  "Brand / Bot Name",
  "CTWA Source URL",
  "Next Follow-up",
  "Actions",
];

export function CrmInboxTable({ cases }: { cases: CrmLeadCase[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden border-t border-[#e5e7eb] bg-white">
      <div className="h-full overflow-auto">
        <table className="min-w-[1480px] table-fixed border-separate border-spacing-0 text-left text-[12px] leading-5">
          <thead className="sticky top-0 z-10 bg-[#f9fafb]">
            <tr className="h-9 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6b7280]">
              {headings.map((heading, index) => (
                <th
                  key={`${heading}-${index}`}
                  className={`border-b border-[#e5e7eb] px-2.5 py-2 ${
                    index === 0 ? "w-9" : ""
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.length > 0 ? (
              cases.map((item) => (
                <tr
                  key={item.id}
                  className="h-[48px] align-middle text-[#1f2933] transition hover:bg-[#f8fafc]"
                >
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      disabled
                      className="h-3.5 w-3.5 rounded border-[#cbd5e1]"
                      aria-label={`Select ${item.customerName}`}
                    />
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="block whitespace-nowrap font-semibold">
                      {item.lastActivityLabel}
                    </span>
                    <span className="block whitespace-nowrap text-[10px] text-[#64748b]">
                      Created {item.createdLabel}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="inline-flex whitespace-nowrap rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-bold text-[#475569]">
                      {item.assignedCsLabel}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <Link
                      href={`/crm/leads/${item.id}`}
                      className="block min-w-0 text-[12px] font-bold text-[#111827] hover:text-[#0f766e]"
                    >
                      <span className="block truncate">{item.customerName}</span>
                      <span className="block truncate font-mono text-[10px] font-semibold text-[#64748b]">
                        {item.canonicalIdentity}
                      </span>
                    </Link>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="block whitespace-nowrap font-semibold">
                      {item.sourceLabel}
                    </span>
                    <span className="block truncate text-[10px] text-[#64748b]">
                      {item.sourceTypeRaw}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="block truncate font-mono text-[10px]">
                      {item.ctwa.ctwa_source_id || "-"}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <CrmStatusBadge status={item.status} label={item.statusLabel} />
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="whitespace-nowrap">{item.createdLabel}</span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="whitespace-nowrap font-semibold">
                      {item.normalizedPhone}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="text-[#94a3b8]">-</span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="inline-flex whitespace-nowrap rounded-md bg-[#ecfeff] px-2 py-0.5 text-[10px] font-bold text-[#0e7490]">
                      {item.crmSourceType}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="block truncate font-semibold">{item.brandName}</span>
                    <span className="block truncate text-[10px] text-[#64748b]">
                      {item.treatmentOffer}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="block max-w-[180px] truncate text-[10px] text-[#64748b]">
                      {item.ctwa.ctwa_source_url || item.pageUrl || "-"}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <span className="whitespace-nowrap text-[11px] font-semibold text-[#64748b]">
                      {item.nextFollowUpLabel}
                    </span>
                  </td>
                  <td className="border-b border-[#eef2f6] px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {item.whatsappUrl ? (
                        <a
                          href={item.whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open WhatsApp"
                          className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2 text-[10px] font-black text-[#15803d] transition hover:bg-[#dcfce7]"
                        >
                          WA
                        </a>
                      ) : (
                        <span
                          title="No WhatsApp phone"
                          className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-[#f8fafc] px-2 text-[10px] font-bold text-[#94a3b8]"
                        >
                          WA
                        </span>
                      )}
                      <Link
                        href={`/crm/leads/${item.id}`}
                        title="Open detail"
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#dbeafe] bg-[#eff6ff] px-2 text-[10px] font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe]"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        disabled
                        title="More actions coming soon"
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white px-2 text-[12px] font-bold text-[#94a3b8]"
                      >
                        ...
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headings.length} className="px-4 py-10 text-center text-[#64748b]">
                  暫時未有 CRM inbox records。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
