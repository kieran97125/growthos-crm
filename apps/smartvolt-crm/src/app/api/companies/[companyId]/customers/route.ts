import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  readCustomer,
  listCustomers,
  updateCustomer,
} from "@/lib/inquiries/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { companyId } = await params,
      q = request.nextUrl.searchParams;
    return json(
      q.has("id")
        ? await readCustomer(
            companyId,
            q.get("id")!,
            q.get("before") ?? undefined,
          )
        : await listCustomers(companyId, q),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    sameOrigin(request);
    return json(
      await updateCustomer(
        (await params).companyId,
        await boundedJson(request),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
