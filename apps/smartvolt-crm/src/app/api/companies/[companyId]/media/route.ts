import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { actMedia, AttachmentError, readMedia } from "@/lib/media/server";
type Context = { params: Promise<{ companyId: string }> };
export const runtime = "nodejs";
export const maxDuration = 120;
function fail(e: unknown) {
  return e instanceof AttachmentError
    ? json({ error: e.message, code: e.code }, e.status)
    : failure(e);
}
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(
      await readMedia(
        (await params).companyId,
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    sameOrigin(req);
    return json(
      await actMedia((await params).companyId, await boundedJson(req)),
    );
  } catch (e) {
    return fail(e);
  }
}
