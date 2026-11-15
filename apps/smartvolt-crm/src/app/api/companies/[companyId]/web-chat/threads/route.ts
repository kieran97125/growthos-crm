import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { readWebChat, actWebChat } from "@/lib/web-chat/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(
      await readWebChat(
        (await params).companyId,
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    sameOrigin(req);
    return json(
      await actWebChat((await params).companyId, await boundedJson(req)),
    );
  } catch (e) {
    return failure(e);
  }
}
