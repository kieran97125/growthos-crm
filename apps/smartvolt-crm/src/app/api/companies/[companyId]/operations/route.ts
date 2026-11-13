import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import {
  actOperations,
  operationsAttention,
  operationsContext,
  readOperations,
  operationsTasks,
} from "@/lib/operations/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { companyId } = await params,
      q = request.nextUrl.searchParams;
    if (q.get("mode") === "attention")
      return json(await operationsAttention(companyId));
    if (q.get("mode") === "followups") {
      const values = Object.fromEntries(q); delete values.mode;
      return json(await operationsTasks(companyId, values));
    }
    if (q.has("thread"))
      return json(
        await operationsContext(companyId, q.get("provider"), q.get("thread")),
      );
    return json(await readOperations(companyId, Object.fromEntries(q)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    sameOrigin(request);
    return json(
      await actOperations((await params).companyId, await boundedJson(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
