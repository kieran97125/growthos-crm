import { redirect } from "next/navigation";
import Link from "next/link";
import { companiesForUser } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { BRAND } from "@/lib/brand";
export const dynamic = "force-dynamic";
export default async function Home() {
  let result;
  try {
    result = await companiesForUser();
  } catch (error) {
    if (error instanceof AccessError && [401, 503].includes(error.status))
      redirect("/login");
    throw error;
  }
  if (result.memberships.length === 1)
    redirect(`/company/${result.memberships[0].company_id}`);
  return (
    <main className="sv-picker">
      <span className="sv-eyebrow">{BRAND.name.toUpperCase()}</span>
      <h1>你嘅公司工作空間</h1>
      <p>選擇一間你有權使用嘅公司，直接開始工作。</p>
      <div className="sv-company-grid">
        {result.memberships.map((m) => {
          const company = Array.isArray(m.sv_companies)
            ? m.sv_companies[0]
            : m.sv_companies;
          return (
            <Link key={m.company_id} href={`/company/${m.company_id}`}>
              <span className="sv-company-monogram">
                {company.name.slice(0, 1)}
              </span>
              <h2>{company.name}</h2>
              <span>{m.role} →</span>
            </Link>
          );
        })}
      </div>
      {!result.memberships.length && (
        <p role="status">
          你嘅帳戶已登入，但未獲分配公司權限。請聯絡公司管理員。
        </p>
      )}
      <form action="/auth/signout" method="post">
        <button className="sv-secondary">登出</button>
      </form>
    </main>
  );
}
