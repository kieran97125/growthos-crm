import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { commitWebsiteImport } from "@/lib/website/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ companyId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  try { sameOrigin(request); return json(await commitWebsiteImport((await params).companyId, await boundedJson(request))); }
  catch (e) { return failure(e); }
}
