"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import useSWR from "swr";
import type { NotificationPage } from "@/lib/notifications/model";
import { engagementFetcher } from "@/components/engagement/fetcher";
export default function NotificationBell({ companyId }: { companyId: string }) {
  const { data } = useSWR<NotificationPage>(
    `/api/companies/${companyId}/notifications`,
    engagementFetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
  return (
    <Link
      className="cq-tool"
      href={`/company/${companyId}/crm/notifications`}
      aria-label={`C 提醒${data?.total ? "，" + data.total + " 項待處理" : ""}`}
    >
      <Bell size={17} />
      <span>
        {data?.total ? (data.total > 99 ? "99+" : data.total) : "提醒"}
      </span>
    </Link>
  );
}
