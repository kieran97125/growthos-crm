import { json } from "@/lib/saas/http";
export async function GET() {
  return json({ status: "unconfigured", model: null });
}
