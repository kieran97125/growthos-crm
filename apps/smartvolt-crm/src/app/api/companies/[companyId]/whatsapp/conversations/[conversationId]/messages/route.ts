import type { NextRequest } from "next/server";
import { failure, json } from "@/lib/saas/http";
import { listMessages } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ companyId: string; conversationId: string }> },
) {
  try {
    const { companyId, conversationId } = await context.params;
    return json(
      await listMessages(
        companyId,
        conversationId,
        request.nextUrl.searchParams,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
