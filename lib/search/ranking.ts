import type { Offer } from "@/lib/inventory/types";

export type SortOption = "best" | "cheapest" | "closest" | "rating";

export const RANKING_WEIGHTS = {
  price: 0.6,
  distance: 0.2,
  rating: 0.1,
  flexibility: 0.1,
} as const;

function inverseMinMax(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (max - value) / (max - min);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function distance(offer: Offer): number {
  return offer.pickupDistanceKm + offer.dropoffDistanceKm;
}

function compareBest(a: Offer, b: Offer): number {
  return (
    (b.score ?? 0) - (a.score ?? 0) ||
    a.price.totalCents - b.price.totalCents ||
    distance(a) - distance(b) ||
    b.supplier.rating - a.supplier.rating ||
    a.offerId.localeCompare(b.offerId)
  );
}

function compareCheapest(a: Offer, b: Offer): number {
  return (
    a.price.totalCents - b.price.totalCents ||
    (b.score ?? 0) - (a.score ?? 0) ||
    a.offerId.localeCompare(b.offerId)
  );
}

function compareClosest(a: Offer, b: Offer): number {
  return (
    distance(a) - distance(b) ||
    a.price.totalCents - b.price.totalCents ||
    a.offerId.localeCompare(b.offerId)
  );
}

function compareRating(a: Offer, b: Offer): number {
  return (
    b.supplier.rating - a.supplier.rating ||
    a.price.totalCents - b.price.totalCents ||
    a.offerId.localeCompare(b.offerId)
  );
}

const COMPARATORS: Record<SortOption, (a: Offer, b: Offer) => number> = {
  best: compareBest,
  cheapest: compareCheapest,
  closest: compareClosest,
  rating: compareRating,
};

function addBadge(map: Map<string, string[]>, offerId: string, badge: string) {
  const current = map.get(offerId) ?? [];
  if (!current.includes(badge)) current.push(badge);
  map.set(offerId, current);
}

/**
 * Scores, badges, and sorts the full candidate set. The caller paginates after
 * this function returns, so page 2 is ranked consistently with page 1.
 */
export function rankOffers(
  offers: Offer[],
  sort: SortOption = "best"
): Offer[] {
  const rankable = offers.filter(
    (offer) => offer.available && !offer.price.requiresQuote
  );

  if (rankable.length === 0) return [];

  const prices = rankable.map((offer) => offer.price.totalCents);
  const distances = rankable.map(distance);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  const scored: Offer[] = rankable.map((offer) => {
    const priceScore = inverseMinMax(
      offer.price.totalCents,
      minPrice,
      maxPrice
    );
    const distanceScore = inverseMinMax(
      distance(offer),
      minDistance,
      maxDistance
    );
    const ratingScore = clamp01((offer.supplier.rating - 1) / 4);
    const flexibilityScore = offer.freeCancellation ? 1 : 0;

    const score =
      100 *
      (RANKING_WEIGHTS.price * priceScore +
        RANKING_WEIGHTS.distance * distanceScore +
        RANKING_WEIGHTS.rating * ratingScore +
        RANKING_WEIGHTS.flexibility * flexibilityScore);

    return {
      ...offer,
      score: round1(score),
      scoreBreakdown: {
        priceScore,
        distanceScore,
        ratingScore,
        flexibilityScore,
      },
    };
  });

  const best = [...scored].sort(compareBest)[0];
  const cheapest = [...scored].sort(compareCheapest)[0];
  const closest = [...scored].sort(compareClosest)[0];
  const topRated = [...scored].sort(compareRating)[0];

  const badges = new Map<string, string[]>();
  addBadge(badges, best.offerId, "BEST_OVERALL");
  addBadge(badges, cheapest.offerId, "CHEAPEST");
  addBadge(badges, closest.offerId, "CLOSEST");
  addBadge(badges, topRated.offerId, "TOP_RATED");

  return scored
    .map((offer) => ({
      ...offer,
      badges: badges.get(offer.offerId) ?? [],
    }))
    .sort(COMPARATORS[sort]);
}
