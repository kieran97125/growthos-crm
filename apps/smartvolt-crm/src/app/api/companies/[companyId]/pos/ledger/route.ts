import type { NextRequest } from "next/server";
import { parseLedgerQuery } from "@/lib/pos/ledger-query";
import { readLedger } from "@/lib/pos/ledger-server";
import { json, failure } from "@/lib/saas/http";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const query = parseLedgerQuery(request.nextUrl.searchParams);
    const { page, nextCursor } = await readLedger(companyId, query);
    return json({
      ...page,
      nextCursor,
      period: {
        from: query.from,
        to: query.to,
        timeZone: "Asia/Hong_Kong",
        basis: "order_created_at",
        payments: "lifetime_registered",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
