import type { NextRequest } from "next/server";
import { json, failure } from "@/lib/saas/http";
import { visitorGet, visitorPost } from "@/lib/web-chat/public";
export const runtime = "nodejs";
type Context = { params: Promise<{ publicId: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    return json(await visitorGet(req, (await params).publicId));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    return json(await visitorPost(req, (await params).publicId));
  } catch (e) {
    return failure(e);
  }
}
