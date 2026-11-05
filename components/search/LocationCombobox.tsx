"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { CityWithCountry } from "./types";

interface LocationComboboxProps {
  label: string;
  placeholder: string;
  value: CityWithCountry | null;
  onChange: (city: CityWithCountry | null) => void;
  allowedCountries?: string[];
  disabled?: boolean;
  hint?: string;
}

export function LocationCombobox({
  label,
  placeholder,
  value,
  onChange,
  allowedCountries,
  disabled,
  hint,
}: LocationComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CityWithCountry[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const allowedKey = (allowedCountries ?? []).join(",");

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: trimmed,
          limit: "8",
        });
        if (allowedKey) params.set("allowedCountries", allowedKey);

        const response = await fetch(`/api/geo/cities?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setResults([]);
          return;
        }
        const data = (await response.json()) as { cities?: CityWithCountry[] };
        setResults(data.cities ?? []);
        setHighlight(data.cities?.length ? 0 : -1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, allowedKey]);

  function selectCity(city: CityWithCountry) {
    setQuery(city.name);
    setOpen(false);
    setResults([]);
    setHighlight(-1);
    onChange(city);
  }

  function handleChange(next: string) {
    setQuery(next);
    setOpen(true);
    setHighlight(-1);
    if (value) onChange(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!open) {
      if (event.key === "ArrowDown") setOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        results.length === 0 ? -1 : (current + 1) % results.length
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) =>
        results.length === 0
          ? -1
          : (current - 1 + results.length) % results.length
      );
    } else if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      const city = results[highlight];
      if (city) selectCity(city);
    }
  }

  const showPopover = open && query.trim().length >= 2;

  return (
    <div className="field location-field" ref={containerRef}>
      <label className="field-label" htmlFor={`${listId}-input`}>
        {label}
      </label>

      <div className={`combo ${disabled ? "is-disabled" : ""}`}>
        <svg
          className="combo-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>

        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="combo-input"
          type="text"
          role="combobox"
          aria-expanded={showPopover}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlight >= 0 ? `${listId}-option-${highlight}` : undefined
          }
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />

        {query ? (
          <button
            type="button"
            className="combo-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              setQuery("");
              setOpen(false);
              onChange(null);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {showPopover ? (
        <div className="combo-popover">
          {loading ? <div className="combo-empty">Searching cities…</div> : null}
          {!loading && results.length === 0 ? (
            <div className="combo-empty">No cities found</div>
          ) : null}
          {!loading && results.length > 0 ? (
            <ul id={listId} role="listbox" className="combo-list">
              {results.map((city, index) => (
                <li key={city.geonameId} role="presentation">
                  <button
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={`combo-option ${index === highlight ? "is-active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => selectCity(city)}
                  >
                    <span className="combo-option-main">
                      <span className="combo-city">{city.name}</span>
                      <span className="combo-region">
                        {city.admin1Code ? `${city.admin1Code}, ` : ""}
                        {city.countryName}
                      </span>
                    </span>
                    <span className="combo-flag">{city.flag || city.countryCode}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <span className="field-hint">
        {value
          ? `${value.countryCode} · ${value.timezone}`
          : hint ?? "Start typing a city name"}
      </span>
    </div>
  );
}
