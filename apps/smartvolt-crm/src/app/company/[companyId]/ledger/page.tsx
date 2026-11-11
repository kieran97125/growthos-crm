import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/saas/identity";
import { parseLedgerQuery } from "@/lib/pos/ledger-query";
import { readLedger } from "@/lib/pos/ledger-server";
import "./ledger.css";

export const dynamic = "force-dynamic";
const money = (cents: number) =>
  new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD" }).format(
    cents / 100,
  );
const dateTime = (at: number) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);

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
  const { page, nextCursor } = result;
  const next = new URLSearchParams({
    from: query.from,
    to: query.to,
    limit: String(query.limit),
  });
  if (query.brand) next.set("brand", query.brand);
  if (nextCursor) next.set("cursor", nextCursor);
  return (
    <main className="sv-picker sv-ledger">
      <nav aria-label="公司導覽">
        <Link href={`/company/${companyId}/pos`}>← POS 工作台</Link>
        <Link href={`/company/${companyId}/settings`}>公司設定</Link>
      </nav>
      <span className="sv-eyebrow">TRANSACTION LEDGER</span>
      <div className="sv-ledger-heading">
        <div>
          <h1>每筆交易，有數可循。</h1>
          <p>{result.company.name} · 訂單、收款及退款</p>
        </div>
        <span className="sv-ledger-badge">只讀帳簿 · v{page.revision}</span>
      </div>
      <form className="sv-ledger-filters" method="get">
        <label>
          訂單開始日期
          <input type="date" name="from" required defaultValue={query.from} />
        </label>
        <label>
          訂單結束日期
          <input type="date" name="to" required defaultValue={query.to} />
        </label>
        {query.brand && (
          <input type="hidden" name="brand" value={query.brand} />
        )}
        <button type="submit">查閱帳簿</button>
      </form>
      <div className="sv-ledger-metrics" aria-label="所選訂單摘要">
        {[
          ["訂單總額", money(page.totals.orderedCents)],
          ["已登記收款", money(page.totals.paidCents)],
          ["已登記退款", money(page.totals.refundedCents)],
          ["淨收款", money(page.totals.netCents)],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <p className="sv-ledger-note">
        按香港時間嘅訂單建立日期篩選；收款及退款為所選訂單截至目前嘅累計登記金額。作廢訂單不計入訂單總額。此頁顯示人工核實記錄。
      </p>
      <section className="sv-ledger-records" aria-labelledby="ledger-records">
        <header>
          <h2 id="ledger-records">交易記錄</h2>
          <span>共 {page.totals.orders} 筆訂單</span>
        </header>
        {page.rows.length ? (
          <div
            className="sv-ledger-table"
            role="region"
            aria-label="可橫向捲動嘅交易表"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">訂單／建立時間</th>
                  <th scope="col">狀態</th>
                  <th scope="col">訂單總額</th>
                  <th scope="col">收款</th>
                  <th scope="col">退款</th>
                  <th scope="col">淨收款</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <strong>{row.number}</strong>
                      <small>{dateTime(row.createdAt)}</small>
                    </th>
                    <td>
                      {row.voided
                        ? "已作廢"
                        : row.refundedCents
                          ? "有退款"
                          : row.totalCents === 0
                            ? "零金額"
                            : row.paidCents >= row.totalCents
                              ? "已付清"
                              : row.paidCents
                                ? "部分付款"
                                : "待付款"}
                    </td>
                    <td>{money(row.totalCents)}</td>
                    <td>{money(row.paidCents)}</td>
                    <td>{money(row.refundedCents)}</td>
                    <td>
                      <b>{money(row.netCents)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sv-ledger-empty">
            <h3>呢段期間未有交易</h3>
            <p>你可以更改日期，或返回 POS 登記第一筆訂單。</p>
          </div>
        )}
        <footer>
          <span>每頁最多 {query.limit} 筆 · 按建立時間排序</span>
          {nextCursor && (
            <Link
              className="sv-secondary"
              href={`/company/${companyId}/ledger?${next}`}
            >
              下一頁 →
            </Link>
          )}
        </footer>
      </section>
    </main>
  );
}
