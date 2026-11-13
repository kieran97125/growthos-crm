export const money = (cents: number) =>
  new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))
    throw Error("請輸入有效金額，最多兩位小數。");
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (result > 100000000) throw Error("金額超出單次記錄上限。");
  return result;
}
export const hkDate = (at: number) =>
  new Date(at + 8 * 3600000).toISOString().slice(0, 10);
export const hkTime = (at: number) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
export const hkDateTime = (at: number) => `${hkDate(at)} ${hkTime(at)}`;
export function localToMillis(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
    throw Error("請揀有效預約日期時間。");
  const at = Date.parse(`${input}:00+08:00`);
  if (
    !Number.isFinite(at) ||
    new Date(at + 8 * 3600000).toISOString().slice(0, 16) !== input
  )
    throw Error("預約日期時間不正確。");
  return at;
}
