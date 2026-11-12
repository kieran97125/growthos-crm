import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/saas/server";
import {
  canonicalAppOrigin,
  confirmationSchema,
} from "@/lib/saas/auth-contract";
export async function GET(request: NextRequest) {
  let origin: string;
  try {
    origin = canonicalAppOrigin();
  } catch {
    return new NextResponse("登入服務尚未完成設定。", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const parsed = confirmationSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  let destination = "/login?confirmation=invalid";
  if (parsed.success) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.verifyOtp(parsed.data);
      if (!error && data.user && !data.user.is_anonymous)
        destination = "/account/password";
    } catch {
      /* Never log tokens or provider details. */
    }
  }
  return NextResponse.redirect(new URL(destination, origin), {
    status: 303,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
