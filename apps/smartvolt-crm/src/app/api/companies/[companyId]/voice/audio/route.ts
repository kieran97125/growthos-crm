import type { NextRequest } from "next/server";
import { failure, json } from "@/lib/saas/http";
import { readVoiceAudio, VoiceError } from "@/lib/voice/server";
type Context = { params: Promise<{ companyId: string }> };
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { companyId } = await params,
      result = await readVoiceAudio(
        companyId,
        Object.fromEntries(req.nextUrl.searchParams),
      );
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Content-Disposition": 'inline; filename="voice"',
      },
    });
  } catch (e) {
    return e instanceof VoiceError
      ? json({ error: e.message, code: e.code }, e.status)
      : failure(e);
  }
}
