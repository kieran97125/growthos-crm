import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { conversationCommand } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ companyId: string; conversationId: string }> },
) {
  try {
    sameOrigin(request);
    const { companyId, conversationId } = await context.params;
    return json(
      await conversationCommand(
        companyId,
        conversationId,
        await boundedJson(request),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
