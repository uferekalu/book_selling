import { describe, expect, it } from "vitest";
import { salesParams } from "@/lib/api/reports-api";
import { periodLabel, presetRange, rangeFromParams, rangeLabel, todayIn } from "./report-range";

describe("report ranges", () => {
  it("counts today in Lagos time (00:30 there is still the previous day in UTC)", () => {
    expect(todayIn("Africa/Lagos", new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
  });

  it("turns presets into inclusive date ranges", () => {
    expect(presetRange("this-month", "2026-10-05")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(presetRange("last-month", "2026-10-05")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last-month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("last-month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("last-30-days", "2026-10-05")).toEqual({ from: "2026-09-06", to: "2026-10-05" });
    expect(presetRange("this-year", "2026-10-05")).toEqual({ from: "2026-01-01", to: "2026-10-05" });
    expect(presetRange("last-year", "2026-10-05")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("reads the range from the URL, falling back to this month on anything odd", () => {
    const read = (q: string) => rangeFromParams(new URLSearchParams(q), "2026-10-05");
    expect(read("preset=last-month")).toEqual({ preset: "last-month", from: "2026-09-01", to: "2026-09-30" });
    expect(read("from=2026-08-01&to=2026-08-31")).toEqual({ preset: "custom", from: "2026-08-01", to: "2026-08-31" });
    expect(read("from=2026-09-01&to=2026-08-01")).toEqual({ preset: "this-month", from: "2026-10-01", to: "2026-10-05" });
    expect(read("preset=bogus")).toMatchObject({ preset: "this-month" });
  });

  it("labels ranges and periods in words", () => {
    expect(rangeLabel("2026-10-01", "2026-10-05")).toBe("1 Oct 2026 – 5 Oct 2026");
    expect(rangeLabel("2026-10-05", "2026-10-05")).toBe("5 Oct 2026");
    expect(periodLabel("2026-10", "month")).toBe("October 2026");
    expect(periodLabel("2026-10-05", "week")).toBe("Week of 5 Oct 2026");
    expect(periodLabel("2026-10-05", "day")).toBe("5 Oct 2026");
  });

  it("sends only the filters that are set", () => {
    expect(salesParams({ from: "2026-10-01", to: "2026-10-31", currency: "NGN", q: "  " }, 1)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      currency: "NGN",
    });
    expect(salesParams({ from: "a", to: "b", format: "print" }, 3)).toEqual({ from: "a", to: "b", format: "print", page: 3 });
  });
});
