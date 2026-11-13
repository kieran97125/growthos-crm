import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  actInquiry,
  availability,
  readInquiries,
  readInquiry,
} from "@/lib/inquiries/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { companyId } = await params,
      q = request.nextUrl.searchParams;
    if (q.has("requestId")) return json(await availability(companyId, q));
    if (q.has("thread"))
      return json(
        await readInquiry(
          companyId,
          q.get("provider"),
          q.get("thread")!,
          q.get("before") ?? undefined,
        ),
      );
    return json(await readInquiries(companyId, Object.fromEntries(q)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    sameOrigin(request);
    return json(
      await actInquiry((await params).companyId, await boundedJson(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
