import { formatCents } from "@/lib/search/pricing";
import type { Offer } from "./types";

const BADGE_LABELS: Record<string, string> = {
  BEST_OVERALL: "Best overall",
  CHEAPEST: "Cheapest",
  CLOSEST: "Closest",
  TOP_RATED: "Top rated",
};

interface OfferCardProps {
  offer: Offer;
  rentalDays: number;
}

export function OfferCard({ offer, rentalDays }: OfferCardProps) {
  const isBest = offer.badges?.includes("BEST_OVERALL");
  const scoreBreakdown = offer.scoreBreakdown;

  return (
    <article className={`offer-card${isBest ? " is-best" : ""}`}>
      <div className="offer-card-top">
        <div>
          <div className="badge-row">
            {(offer.badges ?? []).map((badge) => (
              <span
                key={badge}
                className={`badge badge-${badge.toLowerCase().replaceAll("_", "-")}`}
              >
                {BADGE_LABELS[badge] ?? badge}
              </span>
            ))}
          </div>
          <h3 className="offer-title">{offer.vehicle.name}</h3>
          <p className="offer-subtitle">
            {offer.vehicle.class} · {offer.vehicle.seats} seats ·{" "}
            {offer.vehicle.transmission}
          </p>
        </div>

        <div
          className="score-pill"
          title={
            scoreBreakdown
              ? `Price ${(scoreBreakdown.priceScore * 100).toFixed(0)}% · Distance ${(
                  scoreBreakdown.distanceScore * 100
                ).toFixed(0)}% · Rating ${(
                  scoreBreakdown.ratingScore * 100
                ).toFixed(0)}% · Flexibility ${(
                  scoreBreakdown.flexibilityScore * 100
                ).toFixed(0)}%`
              : "Overall match score"
          }
        >
          <span className="score-value">{offer.score?.toFixed(1)}</span>
          <span className="score-label">match</span>
        </div>
      </div>

      <div className="supplier-row">
        <span className="supplier-name">{offer.supplier.name}</span>
        <span className="supplier-rating">
          <span aria-hidden="true">★</span> {offer.supplier.rating.toFixed(1)}
        </span>
      </div>

      <div className="station-list">
        <div className="station-row">
          <span className="station-dot station-dot-pickup" aria-hidden="true" />
          <div>
            <div className="station-label">Pick-up</div>
            <div className="station-name">{offer.pickupStation.name}</div>
          </div>
          <span className="station-distance">
            {offer.pickupStation.distanceKm.toFixed(1)} km
          </span>
        </div>

        <div className="station-row">
          <span className="station-dot station-dot-dropoff" aria-hidden="true" />
          <div>
            <div className="station-label">Drop-off</div>
            <div className="station-name">{offer.dropoffStation.name}</div>
          </div>
          <span className="station-distance">
            {offer.dropoffStation.distanceKm.toFixed(1)} km
          </span>
        </div>
      </div>

      <div className="offer-card-bottom">
        <div>
          <div className="price">
            {formatCents(offer.price.totalCents, offer.price.currency)}
          </div>
          <div className="price-note">
            {rentalDays} {rentalDays === 1 ? "day" : "days"} · taxes included
          </div>
        </div>

        <div className="perks">
          {offer.freeCancellation ? (
            <span className="perk">Free cancellation</span>
          ) : null}
          {offer.price.oneWayFeeCents > 0 ? (
            <span className="perk perk-muted">One-way fee included</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
