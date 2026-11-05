import { describe, expect, it } from "vitest";
import {
  buildCountryIndex,
  classifyRoute,
  getAllowedCountryCodes,
} from "@/lib/geo/countries";
import type { CountryRecord } from "@/lib/geo/types";

const countries: CountryRecord[] = [
  {
    name: "Germany",
    alpha2Code: "DE",
    alpha3Code: "DEU",
    borders: ["AUT", "BEL", "CHE", "CZE", "DNK", "FRA", "LUX", "NLD", "POL"],
  },
  {
    name: "Austria",
    alpha2Code: "AT",
    alpha3Code: "AUT",
    borders: ["DEU", "CHE", "CZE", "HUN", "ITA", "LIE", "SVK", "SVN"],
  },
  {
    name: "France",
    alpha2Code: "FR",
    alpha3Code: "FRA",
    borders: ["DEU", "BEL", "LUX", "CHE", "ITA", "ESP", "AND", "MCO"],
  },
  {
    name: "Switzerland",
    alpha2Code: "CH",
    alpha3Code: "CHE",
    borders: ["DEU", "FRA", "AUT", "ITA", "LIE"],
  },
  {
    name: "United Kingdom",
    alpha2Code: "GB",
    alpha3Code: "GBR",
    borders: ["IRL"],
  },
  {
    name: "Ireland",
    alpha2Code: "IE",
    alpha3Code: "IRL",
    borders: ["GBR"],
  },
  {
    name: "Japan",
    alpha2Code: "JP",
    alpha3Code: "JPN",
  },
  {
    name: "South Korea",
    alpha2Code: "KR",
    alpha3Code: "KOR",
  },
  {
    name: "Albania",
    alpha2Code: "AL",
    alpha3Code: "ALB",
    borders: ["MNE", "GRC", "MKD", "UNK"],
  },
  {
    name: "Kosovo",
    alpha2Code: "XK",
    alpha3Code: "UNK",
    borders: ["ALB", "MKD", "MNE", "SRB"],
  },
];

const index = buildCountryIndex(countries);

describe("route eligibility", () => {
  it("allows domestic routes", () => {
    expect(classifyRoute(index, "DE", "DE")).toBe("DOMESTIC");
  });

  it("allows land-border neighbours", () => {
    expect(classifyRoute(index, "DE", "AT")).toBe("BORDER");
    expect(classifyRoute(index, "DE", "FR")).toBe("BORDER");
  });

  it("allows a border route in both directions", () => {
    expect(classifyRoute(index, "AT", "DE")).toBe("BORDER");
    expect(classifyRoute(index, "IE", "GB")).toBe("BORDER");
  });

  it("rejects non-neighbouring countries", () => {
    expect(classifyRoute(index, "DE", "GB")).toBe("INVALID");
    expect(classifyRoute(index, "JP", "KR")).toBe("INVALID");
  });

  it("treats a country without borders as domestic-only", () => {
    expect(classifyRoute(index, "JP", "JP")).toBe("DOMESTIC");
    expect(classifyRoute(index, "JP", "DE")).toBe("INVALID");
  });

  it("resolves non-ISO border codes such as Kosovo's UNK", () => {
    expect(classifyRoute(index, "XK", "AL")).toBe("BORDER");
    expect(classifyRoute(index, "XK", "XK")).toBe("DOMESTIC");
  });

  it("returns the pickup country plus its neighbours", () => {
    const allowed = getAllowedCountryCodes(index, "DE");
    expect(allowed[0]).toBe("DE");
    expect(allowed).toEqual(expect.arrayContaining(["AT", "FR", "CH"]));
    expect(allowed).not.toContain("GB");
  });

  it("throws when a country is missing from the index", () => {
    expect(() => classifyRoute(index, "DE", "ZZ")).toThrowError(
      /could not be resolved/
    );
  });
});
