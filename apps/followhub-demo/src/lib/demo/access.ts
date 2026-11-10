import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const cookieName = "followhub_ai_demo";
const sign = (s: string) =>
  createHmac("sha256", process.env.DEMO_ACCESS_CODE ?? "")
    .update(s)
    .digest("base64url");
export function validCode(code: string) {
  const configured = process.env.DEMO_ACCESS_CODE;
  if (!configured) return false;
  const a = Buffer.from(code),
    b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function issueSession(now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ id: randomUUID(), exp: now + 3600000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readSession(
  token: string | undefined,
  now = Date.now(),
): string | null {
  if (!token || !process.env.DEMO_ACCESS_CODE) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const actual = Buffer.from(sig),
    expected = Buffer.from(sign(body));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof p.id === "string" && p.exp > now && p.exp < now + 3700000
      ? p.id
      : null;
  } catch {
    return null;
  }
}
const limits = new Map<string, { at: number; count: number }>();
export function acceptRequest(id: string, now = Date.now()) {
  const prior = limits.get(id);
  if (prior && now - prior.at < 60000) {
    if (prior.count >= 12) return false;
    prior.count++;
    return true;
  }
  if (limits.size > 1000) limits.clear();
  limits.set(id, { at: now, count: 1 });
  return true;
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin"),
    host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return origin === new URL(`${new URL(req.url).protocol}//${host}`).origin;
  } catch {
    return false;
  }
}
