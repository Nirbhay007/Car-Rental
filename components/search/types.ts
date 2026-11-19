import type { CityWithCountry, RouteRelationship } from "@/lib/geo/types";

export type { CityWithCountry, RouteRelationship };

export interface CitySearchResponse {
  cities: CityWithCountry[];
}

export interface RouteCheckResponse {
  allowed: boolean;
  relationship: RouteRelationship;
  pickup: RouteCity;
  dropoff: RouteCity;
  allowedCountries: {
    countryCode: string;
    name: string;
    flag: string;
    relationship: "DOMESTIC" | "BORDER";
  }[];
  message: string;
}

export interface RouteCity {
  cityId: number;
  city: string;
  countryCode: string;
  countryName: string;
  flag: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}
