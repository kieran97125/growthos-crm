import { NextResponse, type NextRequest } from "next/server";
import { confirmMailbox } from "@/lib/saas/mfa-mail";
export async function GET(request: NextRequest) {
  let location = "/auth/mfa";
  const code = request.nextUrl.searchParams.get("code");
  try {
    if (!code || code.length > 512) throw new Error();
    await confirmMailbox({ pkce: code });
  } catch {
    location = "/auth/mfa?mail=retry";
  }
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
