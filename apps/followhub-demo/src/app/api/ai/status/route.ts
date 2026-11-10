import { NextRequest, NextResponse } from "next/server";
import { cookieName, readSession } from "@/lib/demo/access";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const configured =
    !!process.env.AI_GATEWAY_MODEL &&
    !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  const unlocked = !!readSession(req.cookies.get(cookieName)?.value);
  return NextResponse.json(
    {
      status: !configured ? "unconfigured" : unlocked ? "ready" : "locked",
      model: process.env.AI_GATEWAY_MODEL ?? null,
      channel: "demo-only",
      database: "none",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
