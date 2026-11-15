import "server-only";
import { catchUpFlows } from "@/lib/flow-runtime/server";
import { dispatchSocialComments } from "@/lib/social-comments/server";
import { cleanupMediaStaging } from "@/lib/media/server";

/** Durable admission is independently claimed inside each feature. */
export async function advanceInboxAutomations(
  companyId: string,
  cleanup = false,
) {
  const work = await Promise.allSettled([
    catchUpFlows(companyId),
    dispatchSocialComments(companyId),
    ...(cleanup ? [cleanupMediaStaging(companyId)] : []),
  ]);
  return work.every((result) => result.status === "fulfilled");
}
