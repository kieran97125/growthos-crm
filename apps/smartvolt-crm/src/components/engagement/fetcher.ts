export async function engagementFetcher(url: string) {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw Error(d.error ?? "未能讀取訊息資料。");
  return d;
}
