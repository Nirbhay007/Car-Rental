import type { CityWithCountry } from "@/lib/geo/types";

export type { CityWithCountry };

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
