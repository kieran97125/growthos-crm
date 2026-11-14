import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { readSales, actSales } from "@/lib/sales/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(
      await readSales(
        (await params).companyId,
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    sameOrigin(req);
    return json(
      await actSales((await params).companyId, await boundedJson(req)),
    );
  } catch (e) {
    return failure(e);
  }
}
