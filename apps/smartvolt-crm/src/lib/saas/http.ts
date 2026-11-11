import { PosError } from "@/lib/pos/engine";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AccessError } from "./identity";
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export function sameOrigin(request: NextRequest) {
  const configured = process.env.SMARTVOLT_APP_URL;
  const expected = configured
    ? new URL(configured).origin
    : request.nextUrl.origin;
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AccessError("請由公司 CRM 網頁操作。");
}
export function failure(error: unknown) {
  if (error instanceof PosError) return json({ error: error.message }, 400);
  if (error instanceof AccessError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: "資料未通過驗證；改動未有儲存。" }, 400);
  console.error("smartvolt_request_failure", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return json({ error: "服務暫時未能完成操作，請稍後再試。" }, 503);
}
