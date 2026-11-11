import type { NextRequest } from "next/server";
import { failure, json } from "@/lib/saas/http";
import { boundedBytes } from "@/lib/whatsapp/http";
import { MAX_WEBHOOK_BYTES } from "@/lib/whatsapp/protocol";
import { webhookChallenge, webhookIngest } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ connectionId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const challenge = await webhookChallenge(
      (await context.params).connectionId,
      request.nextUrl.searchParams,
    );
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const raw = await boundedBytes(request, MAX_WEBHOOK_BYTES);
    return json(
      await webhookIngest(
        (await context.params).connectionId,
        raw,
        request.headers.get("x-hub-signature-256"),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
