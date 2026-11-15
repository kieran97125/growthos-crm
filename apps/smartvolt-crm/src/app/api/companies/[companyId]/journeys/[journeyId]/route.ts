import type { NextRequest } from "next/server";
import { json, failure } from "@/lib/saas/http";
import { readJourneyHistory } from "@/lib/engagement/journeys-server";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; journeyId: string }> },
) {
  try {
    const p = await params;
    return json(
      await readJourneyHistory(
        p.companyId,
        p.journeyId,
        Object.fromEntries(req.nextUrl.searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
