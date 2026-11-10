import { NextRequest, NextResponse } from "next/server";
import { cookieName, readSession } from "@/lib/demo/access";
import { gatewayConfigured } from "@/lib/demo/gateway";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const configured = gatewayConfigured();
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
