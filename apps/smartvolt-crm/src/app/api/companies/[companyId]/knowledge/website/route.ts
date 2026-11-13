import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { actWebsiteImport, readWebsiteImport } from "@/lib/website/server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try { return json(await readWebsiteImport((await params).companyId, request.nextUrl.searchParams.get("brand") ?? "")); }
  catch (e) { return failure(e); }
}
export async function POST(request: NextRequest, { params }: Context) {
  try { sameOrigin(request); return json(await actWebsiteImport((await params).companyId, await boundedJson(request))); }
  catch (e) { return failure(e); }
}
