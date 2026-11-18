import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  readSocialComments,
  actSocialComments,
  readSocialCommentPosts,
} from "@/lib/social-comments/server";
import { scheduleDeliveryWake } from "@/lib/engagement/request-signal";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const company = (await ctx.params).companyId,
      postsFor = request.nextUrl.searchParams.get("postsFor");
    if (postsFor)
      return json(
        await readSocialCommentPosts(
          company,
          postsFor,
          request.nextUrl.searchParams.get("after") ?? undefined,
        ),
      );
    return json(
      await readSocialComments(company, {
        brandId: request.nextUrl.searchParams.get("brandId") ?? undefined,
        before: request.nextUrl.searchParams.get("before") ?? undefined,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, ctx: Context) {
  try {
    sameOrigin(request);
    const company = (await ctx.params).companyId;
    const result = await actSocialComments(company, await boundedJson(request));
    scheduleDeliveryWake(company);
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
