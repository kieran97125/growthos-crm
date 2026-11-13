export async function operationsFetcher<T>([url]: readonly [
  string,
  string,
]): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error ?? "暫時未能讀取營運資料。"), {
      status: response.status,
    });
  return data as T;
}
export const operationsReadOptions = {
  errorRetryCount: 2,
  shouldRetryOnError: (error: Error & { status?: number }) =>
    !error.status || error.status >= 500,
};
