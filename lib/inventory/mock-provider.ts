import type { CityRecord } from "@/lib/geo/types";
import {
  InventoryError,
  InventoryProvider,
  InventorySearchInput,
  Offer,
} from "./types";

interface MockVehicle {
  key: string;
  class: string;
  name: string;
  seats: number;
  transmission: "manual" | "automatic";
  dailyRateCents: number;
  supplier: { id: string; name: string; rating: number };
}

const VEHICLES: MockVehicle[] = [
  {
    key: "economy",
    class: "Economy",
    name: "VW Polo or similar",
    seats: 5,
    transmission: "manual",
    dailyRateCents: 3_900,
    supplier: { id: "citywheels", name: "CityWheels", rating: 4.2 },
  },
  {
    key: "compact",
    class: "Compact",
    name: "VW Golf or similar",
    seats: 5,
    transmission: "automatic",
    dailyRateCents: 4_900,
    supplier: { id: "eurodrive", name: "EuroDrive", rating: 4.5 },
  },
  {
    key: "suv",
    class: "SUV",
    name: "VW T-Roc or similar",
    seats: 5,
    transmission: "automatic",
    dailyRateCents: 7_900,
    supplier: { id: "alpine", name: "Alpine Mobility", rating: 4.7 },
  },
  {
    key: "premium",
    class: "Premium",
    name: "BMW 3 Series or similar",
    seats: 5,
    transmission: "automatic",
    dailyRateCents: 10_900,
    supplier: { id: "prestige", name: "Prestige Cars", rating: 4.8 },
  },
];

const STATION_LABELS = [
  { label: "City Centre", baseDistanceKm: 0.5 },
  { label: "Central Station", baseDistanceKm: 1.6 },
  { label: "Airport", baseDistanceKm: 4.8 },
];

const TAX_RATE = 0.19;
const CROSS_BORDER_FEE_CENTS = 4_500;

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function stationsFor(city: CityRecord, role: "pickup" | "dropoff") {
  return STATION_LABELS.map((station, index) => {
    const jitter = (hash(`${city.geonameId}:${role}:${index}`) % 9) / 10;
    return {
      id: `station_${city.geonameId}_${index}`,
      name: `${city.name} ${station.label}`,
      distanceKm: Math.round((station.baseDistanceKm + jitter) * 10) / 10,
    };
  });
}

function buildOffer(
  input: InventorySearchInput,
  pickupIndex: number,
  dropoffIndex: number,
  vehicle: MockVehicle,
  pickupStation: { id: string; name: string; distanceKm: number },
  dropoffStation: { id: string; name: string; distanceKm: number }
): Offer {
  const crossBorder = input.pickupCity.countryCode !== input.dropoffCity.countryCode;
  const offerId = [
    "mock",
    input.pickupCity.geonameId,
    input.dropoffCity.geonameId,
    pickupIndex,
    dropoffIndex,
    vehicle.key,
    input.from.getTime(),
    input.to.getTime(),
  ].join("_");

  const digest = hash(offerId);
  const available = digest % 9 !== 0;
  const freeCancellation = digest % 4 !== 0;

  const oneWayFeeCents = crossBorder ? CROSS_BORDER_FEE_CENTS : 0;
  const baseCents = vehicle.dailyRateCents * input.rentalDays;
  const taxesCents = Math.round((baseCents + oneWayFeeCents) * TAX_RATE);
  const totalCents = baseCents + oneWayFeeCents + taxesCents;

  return {
    offerId,
    vehicle: {
      class: vehicle.class,
      name: vehicle.name,
      seats: vehicle.seats,
      transmission: vehicle.transmission,
    },
    supplier: vehicle.supplier,
    pickupStation,
    dropoffStation,
    pickupDistanceKm: pickupStation.distanceKm,
    dropoffDistanceKm: dropoffStation.distanceKm,
    price: {
      currency: "EUR",
      baseCents,
      oneWayFeeCents,
      taxesCents,
      totalCents,
    },
    freeCancellation,
    available,
  };
}

export class MockInventoryProvider implements InventoryProvider {
  readonly name = "mock";

  async search(input: InventorySearchInput): Promise<Offer[]> {
    if (input.currency.toUpperCase() !== "EUR") {
      throw new InventoryError(
        "CURRENCY_UNSUPPORTED",
        "Only EUR is supported at launch",
        422
      );
    }

    const pickupStations = stationsFor(input.pickupCity, "pickup");
    const dropoffStations = stationsFor(input.dropoffCity, "dropoff");

    const offers: Offer[] = [];
    for (let pickupIndex = 0; pickupIndex < pickupStations.length; pickupIndex += 1) {
      for (
        let dropoffIndex = 0;
        dropoffIndex < dropoffStations.length;
        dropoffIndex += 1
      ) {
        for (const vehicle of VEHICLES) {
          offers.push(
            buildOffer(
              input,
              pickupIndex,
              dropoffIndex,
              vehicle,
              pickupStations[pickupIndex],
              dropoffStations[dropoffIndex]
            )
          );
        }
      }
    }

    return offers;
  }

  async getOffer(): Promise<Offer | null> {
    return null;
  }
}

export const inventoryProvider = new MockInventoryProvider();
