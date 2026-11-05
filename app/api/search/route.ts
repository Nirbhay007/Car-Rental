import { errorResponse, makeRequestId, okResponse } from "@/lib/api/response";
import { getCity } from "@/lib/geo/cities";
import {
  classifyRoute,
  getAllowedCountryCodes,
  getCountry,
  getCountryIndex,
} from "@/lib/geo/countries";
import { GeoError } from "@/lib/geo/types";
import { inventoryProvider } from "@/lib/inventory/mock-provider";
import { InventoryError } from "@/lib/inventory/types";
import { calculateRentalDays } from "@/lib/search/pricing";
import {
  isDateIssue,
  parseSearchParams,
} from "@/lib/search/query-schema";
import { rankOffers } from "@/lib/search/ranking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = makeRequestId();
  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(searchParams);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse(
      requestId,
      400,
      isDateIssue(parsed.error.issues) ? "INVALID_DATE_RANGE" : "INVALID_QUERY",
      parsed.error.issues[0]?.message ?? "Invalid search query",
      { issues }
    );
  }

  const query = parsed.data;

  try {
    const [pickupCity, dropoffCity] = await Promise.all([
      getCity(query.pickupCityId).catch((error: unknown) => {
        if (error instanceof GeoError && error.code === "UNKNOWN_CITY") {
          throw new GeoError(
            "UNKNOWN_CITY",
            "Pickup city not found",
            404,
            { pickupCityId: query.pickupCityId }
          );
        }
        throw error;
      }),
      getCity(query.dropoffCityId).catch((error: unknown) => {
        if (error instanceof GeoError && error.code === "UNKNOWN_CITY") {
          throw new GeoError(
            "UNKNOWN_CITY",
            "Drop-off city not found",
            404,
            { dropoffCityId: query.dropoffCityId }
          );
        }
        throw error;
      }),
    ]);

    const index = await getCountryIndex();
    const relationship = classifyRoute(
      index,
      pickupCity.countryCode,
      dropoffCity.countryCode
    );
    const allowedCountries = getAllowedCountryCodes(
      index,
      pickupCity.countryCode
    );

    if (relationship === "INVALID") {
      const pickupCountryName =
        getCountry(index, pickupCity.countryCode)?.name ??
        pickupCity.countryCode;
      const dropoffCountryName =
        getCountry(index, dropoffCity.countryCode)?.name ??
        dropoffCity.countryCode;

      return errorResponse(
        requestId,
        422,
        "ROUTE_NOT_ALLOWED",
        `${dropoffCountryName} is not a neighbouring country of ${pickupCountryName}. Choose a domestic or land-border drop-off.`,
        {
          pickupCountryCode: pickupCity.countryCode,
          dropoffCountryCode: dropoffCity.countryCode,
          allowedCountries,
        }
      );
    }

    const rentalDays = calculateRentalDays(query.from, query.to);
    const offers = await inventoryProvider.search({
      pickupCity,
      dropoffCity,
      from: query.from,
      to: query.to,
      rentalDays,
      currency: query.currency,
    });

    const ranked = rankOffers(offers, query.sort);
    const total = ranked.length;
    const start = (query.page - 1) * query.pageSize;
    const pageOffers = ranked.slice(start, start + query.pageSize);

    return okResponse(
      {
        searchId: `srch_${crypto.randomUUID()}`,
        route: {
          pickup: {
            cityId: pickupCity.geonameId,
            city: pickupCity.name,
            countryCode: pickupCity.countryCode,
            countryName:
              getCountry(index, pickupCity.countryCode)?.name ??
              pickupCity.countryCode,
            timezone: pickupCity.timezone,
          },
          dropoff: {
            cityId: dropoffCity.geonameId,
            city: dropoffCity.name,
            countryCode: dropoffCity.countryCode,
            countryName:
              getCountry(index, dropoffCity.countryCode)?.name ??
              dropoffCity.countryCode,
            timezone: dropoffCity.timezone,
          },
          relationship,
          crossBorder: relationship === "BORDER",
          allowedCountries,
        },
        rental: {
          from: query.from.toISOString(),
          to: query.to.toISOString(),
          rentalDays,
        },
        offers: pageOffers,
        meta: {
          total,
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort,
          rankingVersion: "v1",
          reason: total === 0 ? "NO_AVAILABILITY" : null,
        },
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

    if (error instanceof InventoryError) {
      return errorResponse(
        requestId,
        error.status,
        error.code,
        error.message
      );
    }

    console.error("search failed", error);
    return errorResponse(
      requestId,
      503,
      "INVENTORY_UNAVAILABLE",
      "Car search is temporarily unavailable"
    );
  }
}
