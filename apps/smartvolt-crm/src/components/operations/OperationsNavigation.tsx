import Link from "next/link";
import "./operations-navigation.css";
export default function OperationsNavigation({
  companyId,
  current,
  canManage = false,
}: {
  companyId: string;
  current: "operations" | "supervision" | "reports" | "sales";
  canManage?: boolean;
}) {
  const links = [
    { id: "operations", label: "跟進清單" },
    ...(canManage
      ? [
          { id: "supervision", label: "主管" },
          { id: "reports", label: "成效報表" },
        ]
      : []),
    { id: "sales", label: "官網查詢" },
  ];
  return (
    <nav className="co-subnav" aria-label="營運工作台">
      {links.map((l) => (
        <Link
          key={l.id}
          href={`/company/${companyId}/crm/${l.id}`}
          aria-current={current === l.id ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
