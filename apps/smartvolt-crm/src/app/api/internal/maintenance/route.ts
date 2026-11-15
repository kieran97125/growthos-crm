import { maintenance } from "@/lib/engagement/maintenance";
import { scheduledMaintenance } from "@/lib/engagement/scheduled-maintenance";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
// Vercel removes the public URL because this function has schedule/v1beta only.
export const POST = scheduledMaintenance(maintenance);
