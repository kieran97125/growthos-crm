import type { NextRequest } from "next/server";
import { json, failure, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { actCoaching, readCoaching } from "@/lib/coaching/server";
type Context = { params: Promise<{ companyId: string }> };
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(
      await readCoaching(
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
    const response = await actCoaching(
      (await params).companyId,
      await boundedJson(req),
    );
    return json(
      response,
      "state" in response && response.state === "running" ? 202 : 200,
    );
  } catch (e) {
    return failure(e);
  }
}
