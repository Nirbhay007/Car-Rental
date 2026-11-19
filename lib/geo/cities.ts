import { CityRecord, GeoError } from "./types";

const CITIES_URL = "https://countries.dev/cities";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 500;
const UPSTREAM_TIMEOUT_MS = 3_000;

interface CacheEntry {
  value: CityRecord[] | CityRecord;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function isCityRecord(value: unknown): value is CityRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.geonameId === "number" &&
    typeof record.name === "string" &&
    typeof record.countryCode === "string" &&
    record.countryCode.length === 2 &&
    typeof record.latitude === "number" &&
    typeof record.longitude === "number" &&
    typeof record.timezone === "string"
  );
}

function normalizeCity(raw: Record<string, unknown>): CityRecord {
  return {
    geonameId: Number(raw.geonameId),
    name: String(raw.name),
    asciiName: String(raw.asciiName ?? raw.name),
    countryCode: String(raw.countryCode).toUpperCase(),
    admin1Code: String(raw.admin1Code ?? ""),
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    population: Number(raw.population ?? 0),
    timezone: String(raw.timezone),
    featureCode: String(raw.featureCode ?? ""),
  };
}

async function fetchJson(
  url: string
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    next: { revalidate: 86_400 },
  });
  const payload = response.ok ? await response.json() : null;
  return { response, payload };
}

function readCache<T>(key: string): { value: T; expired: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return {
    value: entry.value as T,
    expired: entry.expiresAt <= Date.now(),
  };
}

function writeCache(key: string, value: CityRecord[] | CityRecord) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchCitySearch(
  q: string,
  country: string | undefined,
  limit: number
): Promise<CityRecord[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (country) params.set("country", country);

  const key = `search:${q.toLowerCase()}:${country ?? "*"}:${limit}`;
  const cached = readCache<CityRecord[]>(key);
  if (cached && !cached.expired) return cached.value;

  try {
    const { response, payload } = await fetchJson(
      `${CITIES_URL}?${params.toString()}`
    );

    // countries.dev answers "No cities found" with a plain-text 404 when a
    // country has no match. That is an empty result, not an upstream failure.
    if (response.status === 404) {
      writeCache(key, []);
      return [];
    }

    if (!response.ok) {
      throw new GeoError(
        "GEO_UPSTREAM_ERROR",
        `City search failed with ${response.status}`,
        502
      );
    }

    if (!Array.isArray(payload)) {
      throw new GeoError(
        "GEO_UPSTREAM_ERROR",
        "countries.dev returned an unexpected city payload",
        502
      );
    }

    const cities = payload
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      )
      .map(normalizeCity)
      .filter(isCityRecord);

    writeCache(key, cities);
    return cities;
  } catch (error) {
    if (cached) return cached.value;
    if (error instanceof GeoError) throw error;
    throw new GeoError(
      "GEO_UNAVAILABLE",
      "City search is temporarily unavailable",
      503
    );
  }
}

export async function getCity(geonameId: number): Promise<CityRecord> {
  const key = `city:${geonameId}`;
  const cached = readCache<CityRecord>(key);
  if (cached && !cached.expired) return cached.value;

  try {
    const { response, payload } = await fetchJson(
      `${CITIES_URL}/${geonameId}`
    );

    if (response.status === 404) {
      throw new GeoError("UNKNOWN_CITY", "City not found", 404);
    }

    if (!response.ok || !isCityRecord(payload)) {
      throw new GeoError(
        "GEO_UPSTREAM_ERROR",
        "countries.dev returned an unexpected city payload",
        502
      );
    }

    const city = normalizeCity(payload as unknown as Record<string, unknown>);
    writeCache(key, city);
    return city;
  } catch (error) {
    if (cached) return cached.value;
    if (error instanceof GeoError) throw error;
    throw new GeoError(
      "GEO_UNAVAILABLE",
      "City lookup is temporarily unavailable",
      503
    );
  }
}

export interface CitySearchInput {
  q: string;
  /** Restrict to these alpha-2 country codes. Omit for an unrestricted search. */
  allowedCountries?: string[];
  limit: number;
}

/**
 * Searches countries.dev and, when a country list is supplied, fans out one
 * request per allowed country and merges by geonameId. All restriction happens
 * here, on the server.
 */
export async function searchCities({
  q,
  allowedCountries,
  limit,
}: CitySearchInput): Promise<CityRecord[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const allowed = Array.from(
    new Set(
      (allowedCountries ?? [])
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code))
    )
  ).slice(0, 12);

  if (allowed.length === 0) {
    return fetchCitySearch(query, undefined, limit);
  }

  const perCountryLimit = Math.min(limit, 8);
  const settled = await Promise.allSettled(
    allowed.map((code) => fetchCitySearch(query, code, perCountryLimit))
  );

  const merged = new Map<number, CityRecord>();
  let fulfilled = 0;

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    fulfilled += 1;
    for (const city of result.value) {
      const existing = merged.get(city.geonameId);
      if (!existing || city.population > existing.population) {
        merged.set(city.geonameId, city);
      }
    }
  }

  if (fulfilled === 0) {
    throw new GeoError(
      "GEO_UNAVAILABLE",
      "City search is temporarily unavailable",
      503
    );
  }

  return Array.from(merged.values())
    .sort((a, b) => b.population - a.population)
    .slice(0, limit);
}
