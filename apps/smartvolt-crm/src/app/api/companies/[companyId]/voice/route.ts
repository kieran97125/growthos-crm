import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedBytes, boundedJson } from "@/lib/whatsapp/http";
import { loadCompany } from "@/lib/saas/server";
import { VOICE_MAX_BYTES } from "@/lib/voice/model";
import {
  actVoice,
  readVoice,
  uploadVoice,
  VoiceError,
} from "@/lib/voice/server";
type Context = { params: Promise<{ companyId: string }> };
export const runtime = "nodejs";
export const maxDuration = 120;
function fail(e: unknown) {
  return e instanceof VoiceError
    ? json(
        {
          error: e.message,
          code: e.code,
          ...(e.terminalFailure ? { terminalFailure: true } : {}),
        },
        e.status,
      )
    : failure(e);
}
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { companyId } = await params;
    return json(
      await readVoice(companyId, Object.fromEntries(req.nextUrl.searchParams)),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    sameOrigin(req);
    const { companyId } = await params;
    const type = req.headers.get("content-type") ?? "";
    if (type.toLowerCase().startsWith("multipart/form-data")) {
      // Authenticate before reading potentially large media, then revalidate scope on registration.
      await loadCompany(companyId, "crm");
      const bytes = await boundedBytes(req, VOICE_MAX_BYTES + 64 * 1024);
      const form = await new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": type },
      }).formData();
      const entries = [...form.entries()];
      if (entries.length !== 5 || new Set(entries.map(([k]) => k)).size !== 5)
        throw new VoiceError("invalid", "上載資料格式不正確。", 400);
      const file = form.get("file");
      if (!(file instanceof File))
        throw new VoiceError("audio_missing", "請選擇原音檔案。", 400);
      return json(
        await uploadVoice(
          companyId,
          {
            brandId: form.get("brandId"),
            source: form.get("source"),
            sourceId: form.get("sourceId"),
          },
          z.uuid().parse(form.get("requestId")),
          file,
        ),
      );
    }
    const result = await actVoice(companyId, await boundedJson(req));
    return json(
      result,
      "state" in result && result.state === "running" ? 202 : 200,
    );
  } catch (e) {
    return fail(e);
  }
}
