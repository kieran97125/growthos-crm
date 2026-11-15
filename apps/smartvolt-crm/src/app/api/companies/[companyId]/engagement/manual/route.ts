import type { NextRequest } from "next/server";
import { json, failure } from "@/lib/saas/http";
import { manualTemplateContext } from "@/lib/engagement/server";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    return json(
      await manualTemplateContext(
        (await params).companyId,
        req.nextUrl.searchParams.get("thread") ?? "",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
