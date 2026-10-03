const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dateWithYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Mar", "12 Mar 2025": for lists and the bell. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < minute) return "just now";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} min ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} h ago`;
  if (elapsed < 2 * day) return "yesterday";
  return at.getFullYear() === now.getFullYear() ? dateOnly.format(at) : dateWithYear.format(at);
}

/** Time of a message in a thread: "14:05" today, "12 Mar, 14:05" otherwise. */
export function messageTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? clock.format(at) : `${(at.getFullYear() === now.getFullYear() ? dateOnly : dateWithYear).format(at)}, ${clock.format(at)}`;
}
