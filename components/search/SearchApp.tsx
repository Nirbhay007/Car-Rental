"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatInZone,
  formatTimezoneLabel,
  toWallTimeInput,
  wallTimeToUtc,
} from "@/lib/geo/time";
import { calculateRentalDays } from "@/lib/search/pricing";
import { LocationCombobox } from "./LocationCombobox";
import { OfferCard } from "./OfferCard";
import type {
  AllowedCountry,
  ApiErrorBody,
  CityWithCountry,
  NeighboursResponse,
  SearchResponse,
  SortOption,
} from "./types";

const LEAD_TIME_MS = 2 * 60 * 60 * 1000;
const MAX_RENTAL_MS = 90 * 24 * 60 * 60 * 1000;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "closest", label: "Closest" },
  { value: "rating", label: "Top rated" },
];

interface UiError {
  title: string;
  message: string;
  detail?: string;
}

export function SearchApp() {
  const [pickup, setPickup] = useState<CityWithCountry | null>(null);
  const [dropoff, setDropoff] = useState<CityWithCountry | null>(null);
  const [allowed, setAllowed] = useState<AllowedCountry[]>([]);
  const [pickupWall, setPickupWall] = useState("");
  const [dropoffWall, setDropoffWall] = useState("");
  const [sort, setSort] = useState<SortOption>("best");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const neighboursRequest = useRef(0);

  useEffect(() => {
    const now = new Date();
    const pickupDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    pickupDate.setHours(10, 0, 0, 0);
    if (pickupDate.getTime() < now.getTime() + LEAD_TIME_MS) {
      pickupDate.setDate(pickupDate.getDate() + 1);
    }
    const dropoffDate = new Date(
      pickupDate.getTime() + 3 * 24 * 60 * 60 * 1000
    );

    setPickupWall(toWallTimeInput(pickupDate));
    setDropoffWall(toWallTimeInput(dropoffDate));
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const allowedCodes = useMemo(
    () => allowed.map((country) => country.countryCode),
    [allowed]
  );

  const previewDays = useMemo(() => {
    if (!pickup || !dropoff || !pickupWall || !dropoffWall) return 0;
    try {
      const from = wallTimeToUtc(pickupWall, pickup.timezone);
      const to = wallTimeToUtc(dropoffWall, dropoff.timezone);
      return calculateRentalDays(from, to);
    } catch {
      return 0;
    }
  }, [pickup, dropoff, pickupWall, dropoffWall]);

  const allowedSummary = useMemo(() => {
    if (!pickup || allowed.length === 0) return "";
    const names = allowed.map((country) => country.name);
    if (names.length <= 4) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  }, [allowed, pickup]);

  async function handlePickupChange(city: CityWithCountry | null) {
    setPickup(city);
    setResult(null);
    setError(null);

    if (!city) {
      setAllowed([]);
      return;
    }

    // Fail closed: restrict to domestic until the neighbour list arrives.
    setAllowed([
      {
        countryCode: city.countryCode,
        name: city.countryName,
        flag: city.flag,
        relationship: "DOMESTIC",
      },
    ]);

    const requestNumber = ++neighboursRequest.current;

    try {
      const response = await fetch(
        `/api/geo/countries/${city.countryCode}/neighbours`
      );
      const payload = (await response.json()) as NeighboursResponse;

      if (requestNumber !== neighboursRequest.current) return;

      if (response.ok && payload.allowedCountries?.length) {
        setAllowed(payload.allowedCountries);
        setDropoff((current) =>
          current &&
          payload.allowedCountries.some(
            (country) => country.countryCode === current.countryCode
          )
            ? current
            : null
        );
        return;
      }

      setAllowed([
        {
          countryCode: city.countryCode,
          name: city.countryName,
          flag: city.flag,
          relationship: "DOMESTIC",
        },
      ]);
    } catch {
      if (requestNumber !== neighboursRequest.current) return;
      setAllowed([
        {
          countryCode: city.countryCode,
          name: city.countryName,
          flag: city.flag,
          relationship: "DOMESTIC",
        },
      ]);
    }
  }

  function handleDropoffChange(city: CityWithCountry | null) {
    setDropoff(city);
    setResult(null);
    setError(null);
  }

  async function runSearch(nextSort: SortOption = sort) {
    setError(null);
    setSort(nextSort);

    if (!pickup || !dropoff) {
      setError({
        title: "Choose both cities",
        message: "Select a pick-up city and a drop-off city to see cars.",
      });
      return;
    }

    if (!pickupWall || !dropoffWall) {
      setError({
        title: "Choose your dates",
        message: "Select a pick-up and drop-off date and time.",
      });
      return;
    }

    let from: Date;
    let to: Date;
    try {
      from = wallTimeToUtc(pickupWall, pickup.timezone);
      to = wallTimeToUtc(dropoffWall, dropoff.timezone);
    } catch {
      setError({
        title: "Invalid dates",
        message: "Check the pick-up and drop-off date and time.",
      });
      return;
    }

    const now = Date.now();
    if (from.getTime() < now + LEAD_TIME_MS) {
      setError({
        title: "Pick-up is too soon",
        message: "Pick-up must be at least 2 hours from now.",
      });
      return;
    }

    if (to.getTime() <= from.getTime()) {
      setError({
        title: "Drop-off must be later",
        message: "Choose a drop-off date and time after the pick-up.",
      });
      return;
    }

    if (to.getTime() - from.getTime() > MAX_RENTAL_MS) {
      setError({
        title: "Rental is too long",
        message: "The maximum rental duration is 90 days.",
      });
      return;
    }

    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({
      pickupCityId: String(pickup.geonameId),
      dropoffCityId: String(dropoff.geonameId),
      from: from.toISOString(),
      to: to.toISOString(),
      sort: nextSort,
      page: "1",
      pageSize: "12",
      currency: "EUR",
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as SearchResponse & ApiErrorBody;

      if (!response.ok) {
        const code = payload.error?.code;
        const allowedNames = allowed.map((country) => country.name).join(", ");
        setError({
          title: code === "ROUTE_NOT_ALLOWED" ? "Drop-off not allowed" : "Search failed",
          message:
            payload.error?.message ??
            "Something went wrong while searching for cars.",
          detail:
            code === "ROUTE_NOT_ALLOWED" && allowedNames
              ? `Allowed drop-off countries: ${allowedNames}.`
              : payload.error?.requestId
                ? `Reference: ${payload.error.requestId}`
                : undefined,
        });
        setResult(null);
        return;
      }

      setResult(payload as SearchResponse);
    } catch (caught) {
      if ((caught as Error).name === "AbortError") return;
      setError({
        title: "Search failed",
        message: "Could not reach the search service. Please try again.",
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  const sortTabs = (
    <div className="sort-tabs" role="group" aria-label="Sort offers">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`sort-tab${sort === option.value ? " is-active" : ""}`}
          aria-pressed={sort === option.value}
          disabled={loading}
          onClick={() => {
            if (result) void runSearch(option.value);
            else setSort(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <main className="shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="SIXT home">
          <span className="brand-mark">S</span>
          <span className="brand-word">SIXT</span>
        </a>
        <span className="header-note">City-to-city demo</span>
      </header>

      <section className="hero">
        <p className="eyebrow">City-to-city car rental</p>
        <h1>
          One car.
          <br />
          <em>Two cities.</em>
        </h1>
        <p className="hero-copy">
          Pick up in one city and drop off in another — as long as they are in the
          same country or share a land border. We rank the offers so the best
          overall car is first.
        </p>
      </section>

      <section className="search-panel" aria-label="Search cars">
        <div className="search-grid">
          <LocationCombobox
            label="Pick-up city"
            placeholder="Munich, Berlin, Paris…"
            value={pickup}
            onChange={handlePickupChange}
          />

          <LocationCombobox
            label="Drop-off city"
            placeholder={
              pickup ? "Choose a city in an allowed country" : "Munich, Salzburg…"
            }
            value={dropoff}
            onChange={handleDropoffChange}
            allowedCountries={pickup ? allowedCodes : undefined}
            disabled={!pickup}
            hint={pickup ? "Restricted to the allowed countries" : "Pick a city first"}
          />

          <label className="field">
            <span className="field-label">Pick-up date</span>
            <input
              className="date-input"
              type="datetime-local"
              value={pickupWall}
              onChange={(event) => {
                setPickupWall(event.target.value);
                setResult(null);
                setError(null);
              }}
            />
            <span className="field-hint">
              {pickup ? formatTimezoneLabel(pickup.timezone) : "City timezone"}
            </span>
          </label>

          <label className="field">
            <span className="field-label">Drop-off date</span>
            <input
              className="date-input"
              type="datetime-local"
              value={dropoffWall}
              onChange={(event) => {
                setDropoffWall(event.target.value);
                setResult(null);
                setError(null);
              }}
            />
            <span className="field-hint">
              {dropoff ? formatTimezoneLabel(dropoff.timezone) : "City timezone"}
            </span>
          </label>

          <div className="field field-action">
            <span className="field-label">&nbsp;</span>
            <button
              type="button"
              className="primary-btn"
              onClick={() => void runSearch()}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Searching
                </>
              ) : (
                <>
                  Search cars
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="search-note">
          <span className="rule-chip">
            <span className="rule-dot" aria-hidden="true" />
            Same country or land-border neighbour
          </span>
          {previewDays > 0 ? (
            <span>
              {previewDays} {previewDays === 1 ? "rental day" : "rental days"}
            </span>
          ) : null}
        </div>

        {pickup && allowedSummary ? (
          <p className="allowed-note">
            Drop-off available in <strong>{allowedSummary}</strong>.
          </p>
        ) : null}

        {pickup && dropoff && pickup.countryCode !== dropoff.countryCode ? (
          <p className="cross-border-note">
            Cross-border rental: {pickup.countryName} → {dropoff.countryName}. A
            one-way fee may apply.
          </p>
        ) : null}

        {error ? (
          <div className="error-banner" role="alert">
            <div>
              <strong>{error.title}</strong>
              <p>{error.message}</p>
              {error.detail ? <p className="error-detail">{error.detail}</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      {result ? (
        <section className="results" aria-live="polite" aria-busy={loading}>
          <div className="results-head">
            <div>
              <p className="eyebrow">Available cars</p>
              <h2 className="results-title">
                {result.route.pickup.city}
                <span className="route-arrow" aria-hidden="true">
                  →
                </span>
                {result.route.dropoff.city}
              </h2>
              <p className="results-sub">
                {result.route.crossBorder ? "Cross-border · " : ""}
                {result.rental.rentalDays}{" "}
                {result.rental.rentalDays === 1 ? "day" : "days"} ·{" "}
                {result.meta.total}{" "}
                {result.meta.total === 1 ? "offer" : "offers"}
              </p>
              <p className="results-dates">
                {formatInZone(
                  new Date(result.rental.from),
                  result.route.pickup.timezone
                )}{" "}
                →{" "}
                {formatInZone(
                  new Date(result.rental.to),
                  result.route.dropoff.timezone
                )}
              </p>
            </div>
            {sortTabs}
          </div>

          {loading ? (
            <div className="updating-bar" role="status">
              <span className="spinner spinner-dark" aria-hidden="true" />
              Updating offers…
            </div>
          ) : null}

          {result.offers.length === 0 ? (
            <div className="empty-state">
              <h3>No cars for these dates</h3>
              <p>
                {result.meta.reason === "NO_STATIONS"
                  ? "We do not have a rental station near one of these cities yet."
                  : "Try a different date range or a nearby city."}
              </p>
            </div>
          ) : (
            <div className={`offer-grid${loading ? " is-loading" : ""}`}>
              {result.offers.map((offer) => (
                <OfferCard
                  key={offer.offerId}
                  offer={offer}
                  rentalDays={result.rental.rentalDays}
                />
              ))}
            </div>
          )}
        </section>
      ) : loading ? (
        <section className="results" aria-busy="true">
          <div className="results-head">
            <div>
              <p className="eyebrow">Available cars</p>
              <h2 className="results-title">Finding your car…</h2>
            </div>
          </div>
          <div className="offer-grid">
            {[0, 1, 2].map((item) => (
              <div className="offer-card skeleton-card" key={item}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-block" />
                <div className="skeleton skeleton-line" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="how-it-works" aria-label="How it works">
        <div className="how-item">
          <span className="how-number">01</span>
          <h3>Pick two cities</h3>
          <p>Search 34,000 cities with live country and timezone data.</p>
        </div>
        <div className="how-item">
          <span className="how-number">02</span>
          <h3>Stay in range</h3>
          <p>
            Drop-off is limited to the same country or a direct land-border
            neighbour.
          </p>
        </div>
        <div className="how-item">
          <span className="how-number">03</span>
          <h3>Get the best car</h3>
          <p>
            Offers are scored on price, station distance, rating, and free
            cancellation.
          </p>
        </div>
      </section>

      <footer className="site-footer">
        <span>
          Geo data from{" "}
          <a href="https://countries.dev" target="_blank" rel="noreferrer">
            countries.dev
          </a>{" "}
          · GeoNames (CC BY 4.0)
        </span>
        <span>Mock inventory · prices in EUR</span>
      </footer>
    </main>
  );
}
