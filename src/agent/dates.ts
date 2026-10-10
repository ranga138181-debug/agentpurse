export function localDate(
  now: Date,
  timezone: string,
): { today: string; weekday: string } {
  const format = (options: Intl.DateTimeFormatOptions, locale: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(
      now,
    );
  return {
    // The en-CA locale formats dates as YYYY-MM-DD.
    today: format(
      { year: "numeric", month: "2-digit", day: "2-digit" },
      "en-CA",
    ),
    weekday: format({ weekday: "long" }, "en-US"),
  };
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
