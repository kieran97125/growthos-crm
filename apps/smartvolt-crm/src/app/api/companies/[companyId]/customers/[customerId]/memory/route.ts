import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  actCustomerMemory,
  readCustomerMemory,
} from "@/lib/customer-memory/server";
type Context = { params: Promise<{ companyId: string; customerId: string }> };
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { companyId, customerId } = await params;
    return json(
      await readCustomerMemory(
        companyId,
        customerId,
        Object.fromEntries(request.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    sameOrigin(request);
    const { companyId, customerId } = await params;
    return json(
      await actCustomerMemory(
        companyId,
        customerId,
        await boundedJson(request),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
