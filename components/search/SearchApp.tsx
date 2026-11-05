"use client";

import { useEffect, useRef, useState } from "react";
import { LocationCombobox } from "./LocationCombobox";
import type { AllowedCountry, CityWithCountry, NeighboursResponse } from "./types";

/** Returns a datetime-local string (YYYY-MM-DDTHH:mm) offset by `offsetMs` from now. */
function defaultDateTimeLocal(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Returns the earliest allowed drop-off datetime-local string:
 * the start of the day AFTER the pick-up date (00:00 next day).
 * This enforces that pick-up and drop-off cannot be on the same calendar day.
 */
function minDropoffDate(fromValue: string): string {
  if (!fromValue) return "";
  // fromValue is "YYYY-MM-DDTHH:mm" — take just the date part, advance by 1 day.
  const datePart = fromValue.slice(0, 10); // "YYYY-MM-DD"
  const next = new Date(`${datePart}T00:00`);
  next.setDate(next.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` +
    `T00:00`
  );
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function SearchApp() {
  const [pickup, setPickup] = useState<CityWithCountry | null>(null);
  const [dropoff, setDropoff] = useState<CityWithCountry | null>(null);
  const [allowed, setAllowed] = useState<AllowedCountry[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Initialise date fields client-side to avoid SSR mismatch.
  useEffect(() => {
    setFromDate(defaultDateTimeLocal(ONE_DAY_MS));
    setToDate(defaultDateTimeLocal(4 * ONE_DAY_MS));
  }, []);

  // Track in-flight neighbour requests so a stale response never overwrites a newer one.
  const neighboursSeq = useRef(0);

  async function handlePickupChange(city: CityWithCountry | null) {
    setPickup(city);
    setDropoff(null);

    if (!city) {
      setAllowed([]);
      return;
    }

    // Start with the pickup country only (domestic). The neighbour fetch may
    // expand this list, but we never leave the drop-off field unrestricted.
    const domestic: AllowedCountry = {
      countryCode: city.countryCode,
      name: city.countryName,
      flag: city.flag,
      relationship: "DOMESTIC",
    };
    setAllowed([domestic]);

    const seq = ++neighboursSeq.current;

    try {
      const res = await fetch(`/api/geo/countries/${city.countryCode}/neighbours`);

      // Always check the sequence number before touching state — even on error —
      // so a slow response from a previous pick-up never overwrites a newer one.
      if (seq !== neighboursSeq.current) return;

      if (!res.ok) return; // keep domestic-only restriction on error

      const payload = (await res.json()) as NeighboursResponse;

      if (payload.allowedCountries?.length) {
        setAllowed(payload.allowedCountries);
      }
    } catch {
      // Network error — keep domestic-only restriction. Already set above.
      // No state update needed; seq check not required on caught errors since
      // we only reach here if the fetch itself threw (e.g. network offline).
    }
  }

  function handleDropoffChange(city: CityWithCountry | null) {
    setDropoff(city);
  }

  const allowedCodes = allowed.map((c) => c.countryCode);

  // Human-readable summary shown below the drop-off field.
  const allowedSummary =
    pickup && allowed.length > 0
      ? allowed.map((c) => `${c.flag} ${c.name}`).join(", ")
      : null;

  return (
    <main className="shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Car Rental home">
          <span className="brand-mark">C</span>
          <span className="brand-word">CarRental</span>
        </a>
        <span className="header-note">Pick-up &amp; Drop-off</span>
      </header>

      <section className="hero">
        <p className="eyebrow">City-to-city car rental</p>
        <h1>
          Pick up here.
          <br />
          <em>Drop off there.</em>
        </h1>
        <p className="hero-copy">
          Choose a pick-up city, then select a drop-off city in the same country
          or a neighbouring country. We use live geo data so the allowed
          drop-off destinations update automatically.
        </p>
      </section>

      <section className="search-panel" aria-label="Location search">
        <div className="search-grid">
          <LocationCombobox
            label="Pick-up city"
            placeholder="Type a city name…"
            value={pickup}
            onChange={handlePickupChange}
          />

          <LocationCombobox
            label="Drop-off city"
            placeholder={pickup ? "Type a city in an allowed country…" : "Select a pick-up city first"}
            value={dropoff}
            onChange={handleDropoffChange}
            allowedCountries={pickup ? allowedCodes : undefined}
            disabled={!pickup}
            hint={
              pickup
                ? "Only same-country or neighbouring countries shown"
                : "Pick a city first"
            }
          />

          <label className="field">
            <span className="field-label">Pick-up date &amp; time</span>
            <input
              className="date-input"
              type="datetime-local"
              value={fromDate}
              onChange={(e) => {
                const next = e.target.value;
                setFromDate(next);
                // If the current drop-off is on the same day or earlier,
                // bump it to the start of the next day.
                const earliest = minDropoffDate(next);
                if (!toDate || toDate < earliest) {
                  setToDate(earliest);
                }
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">Drop-off date &amp; time</span>
            <input
              className="date-input"
              type="datetime-local"
              value={toDate}
              min={minDropoffDate(fromDate)}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </div>

        {allowedSummary ? (
          <p className="allowed-note">
            Drop-off available in: <strong>{allowedSummary}</strong>
          </p>
        ) : null}

        {pickup && dropoff ? (
          <div className="selection-summary">
            <div className="summary-row">
              <span className="summary-label">Pick-up</span>
              <span className="summary-value">
                {pickup.flag} {pickup.name}, {pickup.countryName}
              </span>
            </div>
            <span className="summary-arrow" aria-hidden="true">→</span>
            <div className="summary-row">
              <span className="summary-label">Drop-off</span>
              <span className="summary-value">
                {dropoff.flag} {dropoff.name}, {dropoff.countryName}
              </span>
            </div>
            {pickup.countryCode !== dropoff.countryCode ? (
              <span className="cross-border-badge">Cross-border</span>
            ) : null}
          </div>
        ) : null}
      </section>

      <footer className="site-footer">
        <span>
          Geo data from{" "}
          <a href="https://countries.dev" target="_blank" rel="noreferrer">
            countries.dev
          </a>
        </span>
      </footer>
    </main>
  );
}
