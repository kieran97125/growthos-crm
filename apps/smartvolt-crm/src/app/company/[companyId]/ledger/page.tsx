import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { parseLedgerQuery } from "@/lib/pos/ledger-query";
import { readLedger } from "@/lib/pos/ledger-server";
import LedgerView from "./LedgerView";
import "./ledger.css";

export const dynamic = "force-dynamic";
export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const raw = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string") search.set(key, value);
  let result;
  let query;
  try {
    query = parseLedgerQuery(search);
    result = await readLedger(companyId, query);
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    return (
      <main className="sv-picker sv-ledger">
        <Link href={`/company/${companyId}/settings`}>← 公司設定</Link>
        <h1>交易帳簿暫時未能開啟</h1>
        <p role="alert">
          {error instanceof AccessError
            ? error.message
            : "服務暫時未能完成查閱，請稍後再試。"}
        </p>
        <Link className="sv-secondary" href={`/company/${companyId}/ledger`}>
          重新查閱
        </Link>
      </main>
    );
  }
  return (
    <LedgerView
      companyId={companyId}
      companyName={result.company.name}
      page={result.page}
      nextCursor={result.nextCursor}
      query={query}
    />
  );
}
