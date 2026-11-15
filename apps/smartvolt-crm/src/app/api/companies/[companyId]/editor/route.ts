import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { actEditor } from "@/lib/operations/editor-server";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    sameOrigin(req);
    return json(
      await actEditor((await params).companyId, await boundedJson(req)),
    );
  } catch (e) {
    return failure(e);
  }
}
