import {
  CountryIndex,
  CountryRecord,
  GeoError,
  RouteRelationship,
} from "./types";

const COUNTRIES_URL = "https://countries.dev/countries";
const COUNTRY_FIELDS = [
  "name",
  "alpha2Code",
  "alpha3Code",
  "borders",
  "region",
  "currencies",
  "timezones",
  "flag",
].join(",");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 3_000;

interface IndexCache {
  index: CountryIndex;
  expiresAt: number;
}

let cache: IndexCache | null = null;
let lastGood: CountryIndex | null = null;
let inflight: Promise<CountryIndex> | null = null;

function isCountryRecord(value: unknown): value is CountryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.alpha2Code === "string" &&
    typeof record.alpha3Code === "string" &&
    record.alpha2Code.length === 2 &&
    record.alpha3Code.length === 3 &&
    (record.borders === undefined || Array.isArray(record.borders))
  );
}

/**
 * Pure builder so it can be unit-tested without the network.
 * Borders arrive as ISO alpha-3 codes; cities use alpha-2. We index both and
 * build a symmetric neighbour map.
 */
export function buildCountryIndex(rows: CountryRecord[]): CountryIndex {
  const valid = rows.filter(isCountryRecord);

  if (valid.length === 0) {
    throw new GeoError(
      "GEO_UPSTREAM_ERROR",
      "countries.dev returned no usable countries",
      502
    );
  }

  const byAlpha2 = new Map<string, CountryRecord>();
  const byAlpha3 = new Map<string, CountryRecord>();
  const neighbours = new Map<string, Set<string>>();

  for (const country of valid) {
    byAlpha2.set(country.alpha2Code.toUpperCase(), country);
    byAlpha3.set(country.alpha3Code.toUpperCase(), country);
  }

  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a)!.add(b);
  };

  for (const country of valid) {
    const alpha2 = country.alpha2Code.toUpperCase();
    for (const border of country.borders ?? []) {
      const neighbour = byAlpha3.get(border.toUpperCase());
      if (!neighbour) continue;

      const neighbourAlpha2 = neighbour.alpha2Code.toUpperCase();
      if (neighbourAlpha2 === alpha2) continue;

      // Add both directions even if the upstream data is asymmetric.
      link(alpha2, neighbourAlpha2);
      link(neighbourAlpha2, alpha2);
    }
  }

  return { byAlpha2, byAlpha3, neighbours, fetchedAt: Date.now() };
}

async function fetchCountryIndex(): Promise<CountryIndex> {
  const url = `${COUNTRIES_URL}?fields=${encodeURIComponent(COUNTRY_FIELDS)}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    next: { revalidate: 86_400 },
  });

  if (!response.ok) {
    throw new GeoError(
      "GEO_UPSTREAM_ERROR",
      `countries.dev responded with ${response.status}`,
      502
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new GeoError(
      "GEO_UPSTREAM_ERROR",
      "countries.dev returned an unexpected payload",
      502
    );
  }

  const index = buildCountryIndex(payload as CountryRecord[]);
  cache = { index, expiresAt: Date.now() + CACHE_TTL_MS };
  lastGood = index;
  return index;
}

export async function getCountryIndex(): Promise<CountryIndex> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.index;
  }

  if (!inflight) {
    inflight = fetchCountryIndex().finally(() => {
      inflight = null;
    });
  }

  try {
    return await inflight;
  } catch (error) {
    // Serve stale data rather than failing the whole search.
    if (lastGood) return lastGood;
    if (error instanceof GeoError) throw error;
    throw new GeoError(
      "GEO_UNAVAILABLE",
      "Location data is temporarily unavailable",
      503
    );
  }
}

export function getCountry(
  index: CountryIndex,
  code: string
): CountryRecord | undefined {
  return index.byAlpha2.get(code.trim().toUpperCase());
}

export function getAllowedCountryCodes(
  index: CountryIndex,
  pickupCountryCode: string
): string[] {
  const pickup = pickupCountryCode.trim().toUpperCase();
  const neighbours = index.neighbours.get(pickup);
  return Array.from(new Set([pickup, ...(neighbours ?? [])]));
}

export function classifyRoute(
  index: CountryIndex,
  pickupCountryCode: string,
  dropoffCountryCode: string
): RouteRelationship {
  const pickup = pickupCountryCode.trim().toUpperCase();
  const dropoff = dropoffCountryCode.trim().toUpperCase();

  if (!index.byAlpha2.has(pickup) || !index.byAlpha2.has(dropoff)) {
    throw new GeoError(
      "UNKNOWN_COUNTRY",
      "A country could not be resolved",
      422,
      { pickup, dropoff }
    );
  }

  if (pickup === dropoff) return "DOMESTIC";
  if (index.neighbours.get(pickup)?.has(dropoff)) return "BORDER";
  return "INVALID";
}
