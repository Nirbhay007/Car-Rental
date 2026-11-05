# Car Rental — Pick-up & Drop-off

A Next.js app with a pick-up and drop-off city search form.

Select a **pick-up city**, then select a **drop-off city** — restricted to the same country or
a direct **land-border neighbour**. Add pick-up and drop-off dates and times.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## How it works

- Type in the pick-up box — searches all cities via `countries.dev/cities`.
- Select a pick-up city — fetches allowed countries from `countries.dev/countries` (border graph).
- Type in the drop-off box — only returns cities in the pick-up country or its neighbours.
- All filtering happens server-side. The browser never decides what's allowed.
- Pick-up and drop-off must be on different calendar days — drop-off must be at least the next day.

## API routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/geo/cities?q=&allowedCountries=&limit=` | City search, fan-out per allowed country |
| GET | `/api/geo/countries/[code]/neighbours` | Allowed drop-off countries for a pick-up |

## External APIs used

Only two endpoints from [countries.dev](https://countries.dev):

- `GET /countries?fields=name,alpha2Code,alpha3Code,borders,flag` — builds the neighbour index (fetched once, cached 24 h)
- `GET /cities?q=&country=&limit=` — powers both comboboxes

## Project layout

```
app/
  api/geo/cities/route.ts                      # proxies city search to countries.dev
  api/geo/countries/[code]/neighbours/route.ts # returns allowed drop-off countries
  page.tsx
  globals.css
components/search/
  SearchApp.tsx        # four-field form: pick-up city, drop-off city, from date, to date
  LocationCombobox.tsx # accessible combobox with debounce and keyboard nav
lib/geo/
  countries.ts         # country index, border graph, neighbour lookup
  cities.ts            # city search with per-country fan-out and cache
  types.ts
lib/api/
  response.ts          # shared JSON response helpers
```

## Performance

| Scenario | Latency |
|---|---|
| Pick-up city search (cold) | ~360 ms upstream → instant on cache hit |
| Drop-off fan-out, 10 countries in parallel (cold) | ~160 ms wall time |
| `/neighbours` on warm cache | < 1 ms — pure in-memory read, zero network I/O |
| Keystroke debounce | 300 ms — no request until typing pauses |

Country index (25 KB) is fetched once from `countries.dev` and cached for 24 h.
All city search results are also cached (24 h, 500-entry LRU). Stale data is served
if `countries.dev` is unreachable rather than failing the request.

## Notes

- Country border data uses alpha-3 codes (`"AUT"`); city records use alpha-2 (`"AT"`).
  The server builds a lookup bridge between the two automatically.
- Geo data from countries.dev / GeoNames (CC BY 4.0).
