import type { NextRequest } from "next/server";
import { sameOrigin, json, failure } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { prepareCompanyAnswer } from "@/lib/ai/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    return json(
      await prepareCompanyAnswer(await boundedJson(request), {
        completedOnly: true,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
