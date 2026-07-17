// Deterministic "tonight's pick" — hash the YYYY-MM-DD date string so the
// selection is stable per day but rotates over time. Pure function, no
// randomness at module top level (which would trigger boot_failed).
export function pickTonight<T extends { id: number }>(movies: T[], dateStr: string): T {
  if (!movies.length) throw new Error("no movies to pick from");
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % movies.length;
  return movies[idx];
}

// 'YYYY-MM-DD' in America/Los_Angeles (the user's local timezone).
export function todayLocal(now: Date, tz = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

// Current 'YYYY-MM' in the user's timezone.
export function currentMonth(now: Date, tz = "America/Los_Angeles"): string {
  return todayLocal(now, tz).slice(0, 7);
}
