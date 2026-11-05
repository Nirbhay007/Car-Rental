import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/inventory/types";
import { rankOffers } from "@/lib/search/ranking";

function offer(
  id: string,
  totalCents: number,
  distanceKm: number,
  rating: number,
  freeCancellation: boolean,
  available = true
): Offer {
  return {
    offerId: id,
    vehicle: {
      class: "Compact",
      name: `Car ${id}`,
      seats: 5,
      transmission: "automatic",
    },
    supplier: { id: `supplier_${id}`, name: `Supplier ${id}`, rating },
    pickupStation: { id: `pickup_${id}`, name: "Pickup", distanceKm },
    dropoffStation: { id: `dropoff_${id}`, name: "Dropoff", distanceKm },
    pickupDistanceKm: distanceKm,
    dropoffDistanceKm: 0,
    price: {
      currency: "EUR",
      baseCents: totalCents,
      oneWayFeeCents: 0,
      taxesCents: 0,
      totalCents,
    },
    freeCancellation,
    available,
  };
}

const offers = [
  offer("a", 24_000, 15, 3.5, false),
  offer("b", 25_000, 2, 4.8, true),
  offer("c", 26_500, 5, 4.5, true),
];

describe("best-offer ranking", () => {
  it("picks the close, highly rated car over the cheapest one", () => {
    const ranked = rankOffers(offers, "best");
    expect(ranked[0].offerId).toBe("b");
    expect(ranked[0].badges).toContain("BEST_OVERALL");
    expect(ranked.find((item) => item.offerId === "a")?.badges).toContain(
      "CHEAPEST"
    );
    expect(ranked.find((item) => item.offerId === "b")?.badges).toContain(
      "CLOSEST"
    );
    expect(ranked.find((item) => item.offerId === "b")?.badges).toContain(
      "TOP_RATED"
    );
  });

  it("sorts by price when asked", () => {
    const ranked = rankOffers(offers, "cheapest");
    expect(ranked.map((item) => item.offerId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by distance when asked", () => {
    const ranked = rankOffers(offers, "closest");
    expect(ranked.map((item) => item.offerId)).toEqual(["b", "c", "a"]);
  });

  it("filters unavailable offers", () => {
    const ranked = rankOffers(
      [offer("x", 20_000, 1, 5, true, false), offer("y", 30_000, 9, 4, true)],
      "best"
    );
    expect(ranked.map((item) => item.offerId)).toEqual(["y"]);
  });

  it("is deterministic when all else is equal", () => {
    const first = rankOffers(
      [offer("z", 20_000, 3, 4.5, true), offer("a", 20_000, 3, 4.5, true)],
      "best"
    );
    expect(first.map((item) => item.offerId)).toEqual(["a", "z"]);
  });

  it("uses neutral price and distance scores for a single candidate", () => {
    const ranked = rankOffers([offer("solo", 20_000, 4, 4.5, true)], "best");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].scoreBreakdown?.priceScore).toBe(1);
    expect(ranked[0].scoreBreakdown?.distanceScore).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(98);
  });
});
