"use client";

import { useState } from "react";
import { LocationCombobox } from "./LocationCombobox";
import type {
  ApiErrorBody,
  CityWithCountry,
  RouteCheckResponse,
} from "./types";

export function SearchApp() {
  const [pickup, setPickup] = useState<CityWithCountry | null>(null);
  const [dropoff, setDropoff] = useState<CityWithCountry | null>(null);
  const [result, setResult] = useState<RouteCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handlePickupChange(city: CityWithCountry | null) {
    setPickup(city);
    setDropoff(null);
    setResult(null);
    setError(null);
  }

  function handleDropoffChange(city: CityWithCountry | null) {
    setDropoff(city);
    setResult(null);
    setError(null);
  }

  async function checkRoute() {
    setError(null);
    setResult(null);

    if (!pickup || !dropoff) {
      setError("Choose both a pick-up and a drop-off city.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        pickupCityId: String(pickup.geonameId),
        dropoffCityId: String(dropoff.geonameId),
      });

      const response = await fetch(`/api/route-check?${params.toString()}`);
      const payload = (await response.json()) as RouteCheckResponse &
        ApiErrorBody;

      if (!response.ok) {
        setError(payload.error?.message ?? "Could not check this route.");
        return;
      }

      setResult(payload);
    } catch {
      setError("Could not reach the route service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const neighbourHint = pickup
    ? `Only cities in ${pickup.countryName} or a neighbouring country`
    : "Pick a pick-up city first";

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
          Pick up in one city and drop off in another. The drop-off must be in
          the same country or a direct land-border neighbour — checked on the
          server.
        </p>
      </section>

      <section className="search-panel" aria-label="Choose a route">
        <div className="search-grid">
          <LocationCombobox
            label="Pick-up city"
            placeholder="Munich, Berlin, Paris…"
            value={pickup}
            onChange={handlePickupChange}
            hint="Any city"
          />

          <LocationCombobox
            label="Drop-off city"
            placeholder={
              pickup ? "Search within the allowed countries" : "Pick a city first"
            }
            value={dropoff}
            onChange={handleDropoffChange}
            pickupCityId={pickup?.geonameId}
            disabled={!pickup}
            hint={neighbourHint}
          />

          <div className="field field-action">
            <span className="field-label">&nbsp;</span>
            <button
              type="button"
              className="primary-btn"
              onClick={() => void checkRoute()}
              disabled={loading || !pickup || !dropoff}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Checking
                </>
              ) : (
                <>
                  Check route
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        </div>

        <p className="search-note">
          <span className="rule-chip">
            <span className="rule-dot" aria-hidden="true" />
            Same country or land-border neighbour
          </span>
          <span>Drop-off results are filtered by the API, never in the browser.</span>
        </p>

        {error ? (
          <div className="error-banner" role="alert">
            <strong>{error}</strong>
          </div>
        ) : null}
      </section>

      {result ? (
        <section
          className={`result-card ${result.allowed ? "is-allowed" : "is-rejected"}`}
          aria-live="polite"
        >
          <div className="result-head">
            <span className={`status-pill ${result.allowed ? "ok" : "bad"}`}>
              {result.allowed ? "Route allowed" : "Route not allowed"}
            </span>
            <span className="relationship">
              {result.relationship === "DOMESTIC"
                ? "Same country"
                : result.relationship === "BORDER"
                  ? "Neighbouring countries"
                  : "Not connected by a land border"}
            </span>
          </div>

          <div className="route-line">
            <div className="route-city">
              <span className="route-flag">
                {result.pickup.flag || result.pickup.countryCode}
              </span>
              <div>
                <strong>{result.pickup.city}</strong>
                <span>{result.pickup.countryName}</span>
              </div>
            </div>

            <span className="route-arrow" aria-hidden="true">
              →
            </span>

            <div className="route-city">
              <span className="route-flag">
                {result.dropoff.flag || result.dropoff.countryCode}
              </span>
              <div>
                <strong>{result.dropoff.city}</strong>
                <span>{result.dropoff.countryName}</span>
              </div>
            </div>
          </div>

          <p className="result-message">{result.message}</p>

          {!result.allowed ? (
            <div className="allowed-block">
              <span className="allowed-label">
                Allowed drop-off countries from {result.pickup.countryName}
              </span>
              <ul className="country-chips">
                {result.allowedCountries.map((country) => (
                  <li key={country.countryCode} className="country-chip">
                    <span aria-hidden="true">
                      {country.flag || country.countryCode}
                    </span>
                    {country.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="how-it-works" aria-label="How it works">
        <div className="how-item">
          <span className="how-number">01</span>
          <h3>Pick a city</h3>
          <p>Autocomplete comes from the countries.dev /cities endpoint.</p>
        </div>
        <div className="how-item">
          <span className="how-number">02</span>
          <h3>Drop-off is restricted</h3>
          <p>
            The server looks up the pick-up country and only searches that
            country plus its land-border neighbours.
          </p>
        </div>
        <div className="how-item">
          <span className="how-number">03</span>
          <h3>Check the route</h3>
          <p>
            Both cities are resolved from their IDs and the border rule is
            applied again on the server.
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
        <span>Minimal interview demo</span>
      </footer>
    </main>
  );
}
