import { z } from "zod";
import type { SortOption } from "./ranking";

const ISO_INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const cityId = z.coerce.number().int().positive();

const instant = z
  .string()
  .regex(ISO_INSTANT_RE, "Expected an ISO 8601 timestamp with an offset")
  .transform((value) => new Date(value));

const sort = z.enum(["best", "cheapest", "closest", "rating"]);

export const searchQuerySchema = z
  .object({
    pickupCityId: cityId,
    dropoffCityId: cityId,
    from: instant,
    to: instant,
    sort: sort.default("best"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Expected a 3-letter currency code")
      .default("EUR"),
  })
  .superRefine((value, ctx) => {
    const now = Date.now();
    const durationMs = value.to.getTime() - value.from.getTime();
    const leadMs = value.from.getTime() - now;

    if (durationMs <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Drop-off must be after pickup.",
      });
    }

    if (leadMs < 2 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "Pickup must be at least 2 hours from now.",
      });
    }

    if (durationMs < 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Minimum rental duration is 1 hour.",
      });
    }

    if (durationMs > 90 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Maximum rental duration is 90 days.",
      });
    }

    if (leadMs > 365 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "Pickup is outside the booking window.",
      });
    }
  });

export type SearchQuery = z.infer<typeof searchQuerySchema> & {
  sort: SortOption;
};

export function parseSearchParams(searchParams: URLSearchParams) {
  const raw = Object.fromEntries(searchParams.entries());
  return searchQuerySchema.safeParse(raw);
}

export function isDateIssue(issues: z.ZodIssue[]): boolean {
  return issues.some((issue) =>
    issue.path.some((part) => part === "from" || part === "to")
  );
}
