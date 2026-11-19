import { z } from "zod";
import { errorResponse, makeRequestId, okResponse } from "@/lib/api/response";
import { getCity, searchCities } from "@/lib/geo/cities";
import {
  getAllowedCountryCodes,
  getCountryIndex,
} from "@/lib/geo/countries";
import { CityRecord, CityWithCountry, GeoError } from "@/lib/geo/types";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  pickupCityId: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const { searchParams } = new URL(request.url);

  const rawQ = (searchParams.get("q") ?? "").trim();
  if (rawQ.length < 2) {
    return okResponse({ cities: [] }, requestId);
  }

  const parsed = querySchema.safeParse({
    q: rawQ,
    limit: searchParams.get("limit") ?? undefined,
    pickupCityId: searchParams.get("pickupCityId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(
      requestId,
      400,
      "INVALID_QUERY",
      parsed.error.issues[0]?.message ?? "Invalid city search"
    );
  }

  const { q, limit, pickupCityId } = parsed.data;

  try {
    // The pickup city is resolved from its ID on the server. The client never
    // supplies a country code or filters results itself.
    let allowedCountries: string[] | undefined;
    if (pickupCityId !== undefined) {
      const pickup = await getCity(pickupCityId);
      const index = await getCountryIndex();
      allowedCountries = getAllowedCountryCodes(index, pickup.countryCode);
    }

    const cities = await searchCities({ q, allowedCountries, limit });
    const enriched = await withCountryDetails(cities);

    return okResponse({ cities: enriched }, requestId);
  } catch (error) {
    if (error instanceof GeoError) {
      return errorResponse(
        requestId,
        error.status,
        error.code,
        error.message,
        error.details
      );
    }

    return errorResponse(
      requestId,
      503,
      "GEO_UNAVAILABLE",
      "City search is temporarily unavailable"
    );
  }
}

async function withCountryDetails(
  cities: CityRecord[]
): Promise<CityWithCountry[]> {
  try {
    const index = await getCountryIndex();
    return cities.map((city) => {
      const country = index.byAlpha2.get(city.countryCode);
      return {
        ...city,
        countryName: country?.name ?? city.countryCode,
        flag: country?.flag ?? "",
      };
    });
  } catch {
    // Country names are a nice-to-have; results still work without them.
    return cities.map((city) => ({
      ...city,
      countryName: city.countryCode,
      flag: "",
    }));
  }
}
