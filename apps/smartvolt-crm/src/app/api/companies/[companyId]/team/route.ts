import type { NextRequest } from "next/server";
import { failure, json, sameOrigin } from "@/lib/saas/http";
import { boundedJson } from "@/lib/whatsapp/http";
import { readTeam, actTeam } from "@/lib/team/server";
type Context = { params: Promise<{ companyId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    return json(await readTeam((await context.params).companyId));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    sameOrigin(request);
    return json(
      await actTeam(
        (await context.params).companyId,
        await boundedJson(request),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
