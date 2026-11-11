import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { listConnections, saveConnection } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    return json(await listConnections((await context.params).companyId));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    sameOrigin(request);
    return json(
      await saveConnection(
        (await context.params).companyId,
        await boundedJson(request),
      ),
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
