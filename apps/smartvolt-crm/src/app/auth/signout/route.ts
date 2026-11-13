import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authClient } from "@/lib/saas/server";
import { sameOrigin, failure } from "@/lib/saas/http";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const client = await authClient();
    await client.auth.signOut();
    return NextResponse.redirect(new URL("/login", request.url), {
      status: 303,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
