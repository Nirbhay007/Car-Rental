const GRACE_MINUTES = 29;
const MINUTES_PER_DAY = 1_440;

/**
 * Car rentals are billed in 24-hour blocks, with a 29-minute grace period.
 * 24h 29m counts as one day; 24h 30m counts as two.
 */
export function calculateRentalDays(from: Date, to: Date): number {
  const durationMinutes = (to.getTime() - from.getTime()) / 60_000;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  return Math.max(1, Math.ceil((durationMinutes - GRACE_MINUTES) / MINUTES_PER_DAY));
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
