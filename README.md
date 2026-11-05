# SIXT — City-to-city car rental

A working Next.js demo of the plan in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

Pick a **pick-up city**, a **drop-off city**, and a rental date range. The app only
allows a drop-off in the same country or a direct **land-border neighbour**, then
ranks the available cars by an overall "best offer" score.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm test        # unit tests for eligibility, dates, and ranking
npm run build   # production build
npm run start   # run the production build
```

## What works

- **City autocomplete** backed by the live [countries.dev](https://countries.dev) API.
- **Border-aware eligibility** using `GET /countries?fields=...&borders`:
  - cities provide ISO alpha-2 country codes
  - `borders` provides ISO alpha-3 codes
  - the app builds a symmetric country graph, so `DE → AT` and `AT → DE` both work
  - unknown border codes are ignored; eligibility fails closed
- **Date validation**:
  - pick-up at least 2 hours ahead
  - drop-off after pick-up
  - 1-hour minimum, 90-day maximum
  - timezone-aware wall-clock conversion (`datetime-local` + city IANA timezone)
  - 24-hour rental-day billing with a 29-minute grace period
- **Best-offer ranking**:
  - 60% price, 20% station distance, 10% supplier rating, 10% free cancellation
  - deterministic tie-breakers
  - Best / Cheapest / Closest / Top rated sorts
- **Cross-border UX** including a one-way fee notice.
- **Server-side caching** for countries and city searches, with stale fallback.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/geo/cities?q=&allowedCountries=&limit=` | City autocomplete |
| GET | `/api/geo/countries/[code]/neighbours` | Allowed drop-off countries |
| GET | `/api/search?pickupCityId=&dropoffCityId=&from=&to=` | Ranked offers |

Example:

```bash
curl "http://localhost:3000/api/search?pickupCityId=2867714&dropoffCityId=2766824&from=2026-12-10T09:00:00Z&to=2026-12-14T09:00:00Z&sort=best"
```

## Project layout

```
app/
  api/geo/cities/route.ts
  api/geo/countries/[code]/neighbours/route.ts
  api/search/route.ts
  page.tsx
  globals.css
components/search/
  SearchApp.tsx
  LocationCombobox.tsx
  OfferCard.tsx
lib/geo/
  countries.ts      # index, border graph, eligibility
  cities.ts         # city search + cache
  time.ts           # IANA wall time -> UTC
lib/search/
  query-schema.ts   # Zod validation
  pricing.ts        # rental days
  ranking.ts        # scoring and badges
lib/inventory/
  types.ts          # InventoryProvider interface
  mock-provider.ts  # seeded in-memory inventory
tests/
```

## Notes and limits

- **Inventory is mocked** in `lib/inventory/mock-provider.ts`: 3 stations,
  4 vehicle classes, deterministic availability and prices. Replace
  `MockInventoryProvider` with a real adapter that implements `InventoryProvider`.
- **EUR only** at launch. Other currencies return `CURRENCY_UNSUPPORTED`.
- **In-memory cache** in this demo. The plan's production target is Redis/KV;
  the module boundaries already isolate caching.
- **No booking flow yet.** Search, eligibility, pricing, and ranking are implemented.
- Attribution: geographic data from countries.dev / GeoNames (CC BY 4.0).
