const hongKongClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Keep server and browser text identical despite differences in locale punctuation. */
export function formatHongKongDateTime(
  value: string,
  precision: "minute" | "second" = "minute",
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = Object.fromEntries(
    hongKongClock.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}${precision === "second" ? `:${parts.second}` : ""}`;
}
