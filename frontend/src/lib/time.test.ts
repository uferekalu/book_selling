import { describe, expect, it } from "vitest";
import { messageTime, timeAgo } from "./time";

describe("timeAgo", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("reads naturally from seconds to years", () => {
    expect(timeAgo(ago(20_000), now)).toBe("just now");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(timeAgo(ago(30 * 3_600_000), now)).toBe("yesterday");
    expect(timeAgo("2026-03-12T10:00:00Z", now)).toBe("12 Mar");
    expect(timeAgo("2025-03-12T10:00:00Z", now)).toBe("12 Mar 2025");
  });
});

describe("messageTime", () => {
  it("shows only the clock for today, and the date otherwise", () => {
    const now = new Date(2026, 9, 3, 18, 0);
    expect(messageTime(new Date(2026, 9, 3, 14, 5).toISOString(), now)).toBe("14:05");
    expect(messageTime(new Date(2026, 2, 12, 9, 30).toISOString(), now)).toBe("12 Mar, 09:30");
  });
});
