const WALL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseWallTime(wall: string) {
  const match = WALL_TIME_RE.exec(wall);
  if (!match) throw new Error("Invalid datetime-local value");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

/**
 * Offset of an IANA timezone at a given instant, in minutes east of UTC.
 * The iterative conversion below is enough to handle DST correctly.
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return (asUtc - date.getTime()) / 60_000;
}

/**
 * Converts a wall-clock value from <input type="datetime-local"> to a UTC
 * instant in the selected city's timezone.
 */
export function wallTimeToUtc(wall: string, timeZone: string): Date {
  const { year, month, day, hour, minute } = parseWallTime(wall);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let timestamp = target;

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(timestamp), timeZone);
    const next = target - offset * 60_000;
    if (next === timestamp) break;
    timestamp = next;
  }

  return new Date(timestamp);
}

export function toWallTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

export function formatInZone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone,
  }).format(date);
}

export function formatTimezoneLabel(timeZone: string, date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "shortOffset",
    });
    const part = formatter
      .formatToParts(date)
      .find((item) => item.type === "timeZoneName");
    return part ? `${timeZone} (${part.value})` : timeZone;
  } catch {
    return timeZone;
  }
}
