import type { NextRequest } from "next/server";
import { failure } from "@/lib/saas/http";
import { boundedBytes } from "@/lib/whatsapp/http";
import { metaChallenge, receiveMeta } from "@/lib/meta/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    return new Response(metaChallenge(request.nextUrl.searchParams), {
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    await receiveMeta(
      await boundedBytes(request, 1048576),
      request.headers.get("x-hub-signature-256"),
    );
    return new Response("EVENT_RECEIVED", {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
