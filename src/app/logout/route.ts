import { NextResponse } from "next/server";
import { clearInternalSessionCookie } from "@/lib/security/internalAccessServer";

export async function GET(request: Request) {
  await clearInternalSessionCookie();

  return NextResponse.redirect(new URL("/login", request.url));
}
