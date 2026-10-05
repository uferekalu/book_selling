/** Reports count days in the owner's time zone (Nigeria), like the API (BS-29). */
export const REPORT_TIME_ZONE = "Africa/Lagos";

export const PRESETS = ["this-month", "last-month", "last-30-days", "this-year", "last-year", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABEL: Record<Preset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-30-days": "Last 30 days",
  "this-year": "This year",
  "last-year": "Last year",
  custom: "Custom dates",
};

/** Today's calendar date in the report time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** The inclusive date range a preset stands for, counted from today in the report time zone. */
export function presetRange(preset: Exclude<Preset, "custom">, today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  switch (preset) {
    case "this-month":
      return { from: iso(y, m, 1), to: today };
    case "last-month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "last-30-days":
      return { from: iso(y, m, d - 29), to: today };
    case "this-year":
      return { from: iso(y, 1, 1), to: today };
    case "last-year":
      return { from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31) };
  }
}

const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Reads the range from the URL (?preset= or ?from=&to=), defaulting to this month. */
export function rangeFromParams(params: URLSearchParams, today: string): { preset: Preset; from: string; to: string } {
  const preset = params.get("preset") as Preset | null;
  if (preset && preset !== "custom" && PRESETS.includes(preset)) return { preset, ...presetRange(preset, today) };
  const from = params.get("from");
  const to = params.get("to");
  if (isDate(from) && isDate(to) && from <= to) return { preset: "custom", from, to };
  return { preset: "this-month", ...presetRange("this-month", today) };
}

/** "1 Oct 2026 – 5 Oct 2026", for headings and the spreadsheet name. */
export function rangeLabel(from: string, to: string): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const f = fmt.format(new Date(`${from}T00:00:00Z`));
  const t = fmt.format(new Date(`${to}T00:00:00Z`));
  return from === to ? f : `${f} – ${t}`;
}

/** A period key from the API (2026-10, 2026-10-05, or a week's Monday) in words. */
export function periodLabel(period: string, grouping: "day" | "week" | "month"): string {
  if (grouping === "month") {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
  }
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${period}T00:00:00Z`),
  );
  return grouping === "week" ? `Week of ${day}` : day;
}
