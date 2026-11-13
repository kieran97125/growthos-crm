const timeFormat = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const moneyFormat = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 2,
});
export const when = (s: string) => timeFormat.format(new Date(s));
export const money = (n: number) => moneyFormat.format(n / 100);
