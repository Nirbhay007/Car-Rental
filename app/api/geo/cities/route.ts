import { errorResponse, makeRequestId, okResponse } from "@/lib/api/response";
import { searchCities } from "@/lib/geo/cities";
import { getCountryIndex } from "@/lib/geo/countries";
import { GeoError } from "@/lib/geo/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const { searchParams } = new URL(request.url);

  const q = (searchParams.get("q") ?? "").trim();
  const rawLimit = Number(searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(20, Math.max(1, Math.floor(rawLimit)))
    : 10;
  const country = searchParams.get("country")?.trim().toUpperCase();
  const allowedCountries = (searchParams.get("allowedCountries") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .slice(0, 12);

  if (q.length < 2) {
    return okResponse({ cities: [] }, requestId);
  }

  try {
    const cities = await searchCities({
      q,
      country,
      allowedCountries,
      limit,
    });

    let enriched = cities.map((city) => ({
      ...city,
      countryName: city.countryCode,
      flag: "",
    }));

    try {
      const index = await getCountryIndex();
      enriched = cities.map((city) => {
        const country = index.byAlpha2.get(city.countryCode);
        return {
          ...city,
          countryName: country?.name ?? city.countryCode,
          flag: country?.flag ?? "",
        };
      });
    } catch {
      // Country names are a nice-to-have; city results still work without them.
    }

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
