export interface CountryRecord {
  name: string;
  alpha2Code: string;
  alpha3Code: string;
  borders?: string[];
  region?: string;
  currencies?: { code: string; name: string; symbol: string }[];
  timezones?: string[];
  flag?: string;
}

export interface CountryIndex {
  byAlpha2: Map<string, CountryRecord>;
  byAlpha3: Map<string, CountryRecord>;
  neighbours: Map<string, Set<string>>;
  fetchedAt: number;
}

export interface CityRecord {
  geonameId: number;
  name: string;
  asciiName: string;
  countryCode: string;
  admin1Code: string;
  latitude: number;
  longitude: number;
  population: number;
  timezone: string;
  featureCode: string;
}

export interface CityWithCountry extends CityRecord {
  countryName: string;
  flag: string;
}

export type RouteRelationship = "DOMESTIC" | "BORDER" | "INVALID";

export class GeoError extends Error {
  code:
    | "GEO_UNAVAILABLE"
    | "GEO_UPSTREAM_ERROR"
    | "UNKNOWN_CITY"
    | "UNKNOWN_COUNTRY";

  status: number;
  details?: unknown;

  constructor(
    code: GeoError["code"],
    message: string,
    status: number,
    details?: unknown
  ) {
    super(message);
    this.name = "GeoError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
