import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { companyAIStatus, configureCompanyAI } from "@/lib/ai/server";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("companyId");
    return json(
      id
        ? await companyAIStatus(id)
        : { status: "company_required", model: null },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const data = z
      .object({ companyId: z.uuid(), enabled: z.boolean() })
      .strict()
      .parse(await boundedJson(request));
    return json(await configureCompanyAI(data.companyId, data.enabled));
  } catch (e) {
    return failure(e);
  }
}
