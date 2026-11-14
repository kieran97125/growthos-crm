import { NextRequest, NextResponse } from "next/server";
import {
  maintenance,
  validCronAuthorization,
} from "@/lib/engagement/maintenance";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get("authorization")))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const result = await maintenance();
  return NextResponse.json(result, {
    status: result.failed ? 207 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
