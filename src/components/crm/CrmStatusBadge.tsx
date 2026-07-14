import type { CrmStatus } from "@/lib/crm/leadOps";

const statusStyles: Record<CrmStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  contacting: "border-amber-200 bg-amber-50 text-amber-700",
  booked: "border-indigo-200 bg-indigo-50 text-indigo-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  showed: "border-teal-200 bg-teal-50 text-teal-700",
  paid: "border-green-200 bg-green-50 text-green-700",
  no_show: "border-rose-200 bg-rose-50 text-rose-700",
  lost: "border-slate-200 bg-slate-50 text-slate-600",
  invalid: "border-red-200 bg-red-50 text-red-700",
};

export function CrmStatusBadge({
  status,
  label,
}: {
  status: CrmStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold leading-4 ${statusStyles[status]}`}
    >
      {label}
    </span>
  );
}
