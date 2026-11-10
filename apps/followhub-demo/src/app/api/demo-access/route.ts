import { sameOrigin } from "@/lib/demo/access";
import { NextRequest, NextResponse } from "next/server";
import {
  acceptRequest,
  cookieName,
  issueSession,
  validCode,
} from "@/lib/demo/access";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json(
      { error: "請由 Demo 網頁操作。" },
      { status: 403 },
    );
  if (!acceptRequest(`unlock:${req.headers.get("x-forwarded-for") ?? "local"}`))
    return NextResponse.json({ error: "請稍後再試。" }, { status: 429 });
  let input: unknown;
  try {
    const text = await req.text();
    if (text.length > 500) throw Error();
    input = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "資料格式錯誤。" }, { status: 400 });
  }
  const code = (input as { code?: unknown })?.code;
  if (typeof code !== "string" || !validCode(code))
    return NextResponse.json(
      { error: "體驗碼不正確或尚未設定。" },
      { status: 401 },
    );
  const result = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  result.cookies.set(cookieName, issueSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
    path: "/",
  });
  return result;
}
