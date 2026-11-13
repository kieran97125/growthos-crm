import type { NextRequest } from "next/server";
import { sameOrigin, json, failure } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  translateCompanyText,
  TranslationError,
} from "@/lib/translation/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const result = await translateCompanyText(await boundedJson(request));
    return json(result, "state" in result ? 202 : 200);
  } catch (error) {
    if (error instanceof TranslationError)
      return json({ error: error.message, code: error.code }, error.status);
    return failure(error);
  }
}
