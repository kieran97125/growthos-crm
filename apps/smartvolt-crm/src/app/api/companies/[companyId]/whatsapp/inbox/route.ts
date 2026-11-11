import type { NextRequest } from "next/server";
import { failure, json } from "@/lib/saas/http";
import { listInbox } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> },
) {
  try {
    return json(
      await listInbox(
        (await context.params).companyId,
        request.nextUrl.searchParams,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
