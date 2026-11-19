import { z } from "zod";
import { errorResponse, makeRequestId, okResponse } from "@/lib/api/response";
import { getCity } from "@/lib/geo/cities";
import {
  classifyRoute,
  getAllowedCountryCodes,
  getCountry,
  getCountryIndex,
} from "@/lib/geo/countries";
import { CityRecord, CountryIndex, GeoError } from "@/lib/geo/types";

export const dynamic = "force-dynamic";

const cityId = z.coerce.number().int().positive();

const querySchema = z.object({
  pickupCityId: cityId,
  dropoffCityId: cityId,
});

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    pickupCityId: searchParams.get("pickupCityId") ?? undefined,
    dropoffCityId: searchParams.get("dropoffCityId") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(
      requestId,
      400,
      "INVALID_QUERY",
      "pickupCityId and dropoffCityId are required"
    );
  }

  try {
    const [pickup, dropoff] = await Promise.all([
      getCity(parsed.data.pickupCityId),
      getCity(parsed.data.dropoffCityId),
    ]);

    const index = await getCountryIndex();
    const relationship = classifyRoute(
      index,
      pickup.countryCode,
      dropoff.countryCode
    );
    const allowed = relationship !== "INVALID";

    return okResponse(
      {
        allowed,
        relationship,
        pickup: describeCity(index, pickup),
        dropoff: describeCity(index, dropoff),
        allowedCountries: getAllowedCountryCodes(index, pickup.countryCode).map(
          (code) => {
            const country = getCountry(index, code);
            return {
              countryCode: code,
              name: country?.name ?? code,
              flag: country?.flag ?? "",
              relationship: code === pickup.countryCode ? "DOMESTIC" : "BORDER",
            };
          }
        ),
        message: allowed
          ? relationship === "DOMESTIC"
            ? "Pick-up and drop-off are in the same country."
            : "Pick-up and drop-off are in neighbouring countries."
          : "Drop-off must be in the same country or a direct land-border neighbour.",
      },
      requestId
    );
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
      "Route check is temporarily unavailable"
    );
  }
}

function describeCity(index: CountryIndex, city: CityRecord) {
  const country = getCountry(index, city.countryCode);
  return {
    cityId: city.geonameId,
    city: city.name,
    countryCode: city.countryCode,
    countryName: country?.name ?? city.countryCode,
    flag: country?.flag ?? "",
  };
}
