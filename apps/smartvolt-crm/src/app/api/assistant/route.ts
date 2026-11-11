import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/saas/server";
import { sameOrigin, json, failure } from "@/lib/saas/http";
import { AccessError } from "@/lib/saas/identity";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const text = await request.text();
    if (text.length > 64000) throw new AccessError("資料太大。", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AccessError("資料格式不正確。", 400);
    }
    if (typeof body.companyId !== "string")
      throw new AccessError("請先登入公司工作空間。", 401);
    await requireCompany(body.companyId);
    return json(
      {
        error:
          "此公司嘅真實 AI 模型尚未啟用。可於 AI BOT 使用清楚標示嘅示範引擎。",
        code: "company_ai_not_activated",
      },
      503,
    );
  } catch (error) {
    return failure(error);
  }
}
