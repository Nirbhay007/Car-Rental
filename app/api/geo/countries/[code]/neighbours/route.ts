import { errorResponse, makeRequestId, okResponse } from "@/lib/api/response";
import {
  getAllowedCountryCodes,
  getCountry,
  getCountryIndex,
} from "@/lib/geo/countries";
import { GeoError } from "@/lib/geo/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const requestId = makeRequestId();
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return errorResponse(
      requestId,
      400,
      "INVALID_QUERY",
      "Expected a two-letter country code"
    );
  }

  try {
    const index = await getCountryIndex();
    const country = getCountry(index, code);

    if (!country) {
      return errorResponse(
        requestId,
        404,
        "UNKNOWN_COUNTRY",
        "Country not found"
      );
    }

    const allowedCountries = getAllowedCountryCodes(index, code).map(
      (countryCode) => {
        const neighbour = getCountry(index, countryCode);
        return {
          countryCode,
          name: neighbour?.name ?? countryCode,
          flag: neighbour?.flag ?? "",
          relationship: countryCode === code ? "DOMESTIC" : "BORDER",
        };
      }
    );

    return okResponse(
      {
        countryCode: code,
        countryName: country.name,
        allowedCountries,
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
      "Country data is temporarily unavailable"
    );
  }
}
