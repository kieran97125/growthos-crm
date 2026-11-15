"use client";
import { useEffect } from "react";
import useSWR from "swr";
import type {
  CoachingCommand,
  CoachingPage,
  CoachingSource,
} from "@/lib/coaching/model";

export class CoachingRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export function coachingEndpoint(companyId: string) {
  return `/api/companies/${encodeURIComponent(companyId)}/coaching`;
}
async function readCoaching(url: string): Promise<CoachingPage> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new CoachingRequestError(
      data.error ?? "未能讀取客服教練。",
      response.status,
      data.code,
    );
  return data;
}
export function useCoachingPage({
  companyId,
  brandId,
  source,
  sourceId,
  sourceRevision,
}: {
  companyId: string;
  brandId: string;
  source?: CoachingSource;
  sourceId?: string;
  sourceRevision?: number;
}) {
  const query = new URLSearchParams({
    brandId,
    ...(source && sourceId ? { source, sourceId } : {}),
  });
  const url = coachingEndpoint(companyId) + "?" + query;
  const result = useSWR<CoachingPage>(
    companyId && brandId ? [url, sourceRevision ?? 0] : null,
    ([endpoint]: [string, number]) => readCoaching(endpoint),
    {
      revalidateOnFocus: true,
      keepPreviousData: false,
      shouldRetryOnError: false,
    },
  );
  const { mutate } = result;
  useEffect(() => {
    const changed = () => void mutate().catch(() => undefined);
    window.addEventListener("convelta:data-changed", changed);
    return () => window.removeEventListener("convelta:data-changed", changed);
  }, [mutate]);
  return { ...result, scopeKey: `${url}#${sourceRevision ?? 0}` };
}
export async function coachingCommand<T>(
  companyId: string,
  command: CoachingCommand,
): Promise<T> {
  const response = await fetch(coachingEndpoint(companyId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok)
    throw new CoachingRequestError(
      data.error ?? "結果未能確認，請核對同一操作。",
      response.status,
      data.code,
    );
  return data;
}
export const knownFailure = (error: unknown) =>
  error instanceof CoachingRequestError && error.status < 500;
