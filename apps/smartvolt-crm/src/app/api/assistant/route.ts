import type { NextRequest } from "next/server";
import { sameOrigin, json, failure } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { prepareCompanyAnswer, AIServiceError } from "@/lib/ai/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const result = await prepareCompanyAnswer(await boundedJson(request));
    return json(
      result,
      result &&
        typeof result === "object" &&
        "state" in result &&
        result.state === "running"
        ? 202
        : 200,
    );
  } catch (error) {
    if (error instanceof AIServiceError)
      return json({ error: error.message, code: error.code }, error.status);
    return failure(error);
  }
}
