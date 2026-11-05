import type { CityWithCountry, RouteRelationship } from "@/lib/geo/types";
import type { Offer } from "@/lib/inventory/types";

export type { CityWithCountry, Offer, RouteRelationship };

export type SortOption = "best" | "cheapest" | "closest" | "rating";

export interface AllowedCountry {
  countryCode: string;
  name: string;
  flag: string;
  relationship: "DOMESTIC" | "BORDER";
}

export interface NeighboursResponse {
  countryCode: string;
  countryName: string;
  allowedCountries: AllowedCountry[];
}

export interface SearchResponse {
  searchId: string;
  route: {
    pickup: {
      cityId: number;
      city: string;
      countryCode: string;
      countryName: string;
      timezone: string;
    };
    dropoff: {
      cityId: number;
      city: string;
      countryCode: string;
      countryName: string;
      timezone: string;
    };
    relationship: RouteRelationship;
    crossBorder: boolean;
    allowedCountries: string[];
  };
  rental: {
    from: string;
    to: string;
    rentalDays: number;
  };
  offers: Offer[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    sort: SortOption;
    rankingVersion: string;
    reason: "NO_STATIONS" | "NO_AVAILABILITY" | null;
  };
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      allowedCountries?: string[];
      issues?: { path: string; message: string }[];
      [key: string]: unknown;
    };
    requestId?: string;
  };
}
