import type { CityRecord } from "@/lib/geo/types";

export interface StationSummary {
  id: string;
  name: string;
  distanceKm: number;
}

export interface PriceBreakdown {
  currency: string;
  baseCents: number;
  oneWayFeeCents: number;
  taxesCents: number;
  totalCents: number;
  requiresQuote?: boolean;
}

export interface ScoreBreakdown {
  priceScore: number;
  distanceScore: number;
  ratingScore: number;
  flexibilityScore: number;
}

export interface Offer {
  offerId: string;
  vehicle: {
    class: string;
    name: string;
    seats: number;
    transmission: "manual" | "automatic";
  };
  supplier: { id: string; name: string; rating: number };
  pickupStation: StationSummary;
  dropoffStation: StationSummary;
  pickupDistanceKm: number;
  dropoffDistanceKm: number;
  price: PriceBreakdown;
  freeCancellation: boolean;
  available: boolean;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
  badges?: string[];
}

export interface InventorySearchInput {
  pickupCity: CityRecord;
  dropoffCity: CityRecord;
  from: Date;
  to: Date;
  rentalDays: number;
  currency: string;
}

export interface InventoryProvider {
  readonly name: string;
  search(input: InventorySearchInput): Promise<Offer[]>;
  getOffer(offerId: string): Promise<Offer | null>;
}

export class InventoryError extends Error {
  code: "CURRENCY_UNSUPPORTED" | "INVENTORY_UNAVAILABLE";
  status: number;

  constructor(
    code: InventoryError["code"],
    message: string,
    status = 422
  ) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.status = status;
  }
}
