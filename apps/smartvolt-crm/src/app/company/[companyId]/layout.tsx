import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/saas/server";
import { AccessError } from "@/lib/saas/identity";
import { MfaEnrollmentNotice } from "@/app/auth/mfa/MfaEnrollmentNotice";
import CompanyWorkspace from "@/components/workspace/CompanyWorkspace";
export default async function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let access;
  try {
    access = await requireCompany(companyId);
  } catch (error) {
    if (error instanceof AccessError && error.status === 428)
      redirect("/auth/mfa");
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    if (!(error instanceof AccessError)) throw error;
    return (
      <main className="sv-picker">
        <h1>未能開啟公司工作空間</h1>
        <p role="alert">{error.message}</p>
        <Link href="/">返回公司選擇</Link>
      </main>
    );
  }
  const workspace = (
    <CompanyWorkspace
      key={companyId}
      companyId={companyId}
      companyName={access.company.name}
      actorName={access.actor.name}
      actorId={access.actor.id}
      products={access.products}
    >
      {children}
    </CompanyWorkspace>
  );
  if (!access.mfaEnrollmentPending) return workspace;
  return (
    <div className="sv-enrollment-workspace">
      <MfaEnrollmentNotice />
      <div className="sv-enrollment-work-area">{workspace}</div>
    </div>
  );
}
