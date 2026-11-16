import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { publicConfig } from "@/lib/web-chat/public";
import { chatFramePolicy } from "@/lib/web-chat/model";
import { chatFrameHtml } from "@/lib/web-chat/embed";
import { AccessError } from "@/lib/saas/identity";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const config = await publicConfig(
      (await params).publicId,
      request.nextUrl.searchParams.get("site") ?? "",
    );
    const nonce = randomBytes(24).toString("base64");
    return new Response(chatFrameHtml(config, nonce), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": chatFramePolicy([config.origin], nonce),
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },
    });
  } catch (error) {
    return new Response(
      "<!doctype html><html lang=zh-HK><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>網站查詢</title><body><p>網站聊天暫時未能使用，請用店舖其他聯絡方式查詢。</p></body></html>",
      {
        status: error instanceof AccessError && error.status === 503 ? 503 : 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      },
    );
  }
}

