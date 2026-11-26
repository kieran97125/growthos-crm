import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { readChatSettings, changeChatSettings } from "@/lib/web-chat/server";
type Context = { params: Promise<{ companyId: string }> };
export const maxDuration = 60;
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    return json(await readChatSettings((await params).companyId));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    sameOrigin(req);
    return json(
      await changeChatSettings(
        (await params).companyId,
        await boundedJson(req),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
