import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedBytes } from "@/lib/whatsapp/http";
import { AccessError } from "@/lib/saas/identity";
import { actFlowRuntime, readFlowRuntime } from "@/lib/flow-runtime/server";
import { scheduleDeliveryWake } from "@/lib/engagement/request-signal";
type Context = { params: Promise<{ companyId: string }> };
export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(
      await readFlowRuntime(
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
    if (
      !req.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new AccessError("請以 JSON 提交資料。", 415);
    const bytes = await boundedBytes(req, 150000);
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new AccessError("請求 JSON 格式不正確。", 400);
    }
    const company = (await params).companyId,
      r = await actFlowRuntime(company, body);
    scheduleDeliveryWake(company);
    return json(r);
  } catch (e) {
    return failure(e);
  }
}
