import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { AIServiceError } from "@/lib/ai/server";
import {
  readCopilot,
  askCopilot,
  actCopilot,
  readCopilotReceipt,
} from "@/lib/copilot/server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const q = request.nextUrl.searchParams,
      raw = q.get("context");
    if (raw && raw.length > 1200) return json({ error: "工作範圍過長。" }, 400);
    const context = raw
      ? JSON.parse(raw)
      : { product: "crm", section: "inbox" };
    if (q.get("receipt"))
      return json(
        await readCopilotReceipt(
          (await params).companyId,
          context,
          q.get("receipt")!,
        ),
      );
    return json(
      await readCopilot(
        (await params).companyId,
        context,
        q.get("thread") ?? undefined,
      ),
    );
  } catch (e) {
    if (e instanceof SyntaxError)
      return json({ error: "工作範圍未通過核對。" }, 400);
    return failure(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    sameOrigin(request);
    const raw = await boundedJson(request),
      companyId = (await params).companyId;
    const result =
      raw &&
      typeof raw === "object" &&
      "action" in raw &&
      raw.action === "ask" &&
      "request" in raw
        ? await askCopilot(companyId, raw.request)
        : await actCopilot(companyId, raw);
    return json(
      result,
      result &&
        typeof result === "object" &&
        "state" in result &&
        result.state === "running"
        ? 202
        : 200,
    );
  } catch (e) {
    if (e instanceof AIServiceError)
      return json({ error: e.message, code: e.code }, e.status);
    return failure(e);
  }
}
