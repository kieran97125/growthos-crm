import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { readMeta, actMeta } from "@/lib/meta/server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, ctx: Context) {
  try {
    return json(
      await readMeta(
        (await ctx.params).companyId,
        request.nextUrl.searchParams.get("thread") ?? undefined,
        request.nextUrl.searchParams.get("before") ?? undefined,
        {
          queue: request.nextUrl.searchParams.get("queue") ?? undefined,
          channel: request.nextUrl.searchParams.get("channel") ?? undefined,
          search: request.nextUrl.searchParams.get("search") ?? undefined,
        },
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, ctx: Context) {
  try {
    sameOrigin(request);
    return json(
      await actMeta((await ctx.params).companyId, await boundedJson(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
