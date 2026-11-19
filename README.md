# SIXT — City-to-city car rental (minimal demo)

Pick a pick-up city and a drop-off city. The app allows the route only when both
cities are in the **same country or direct land-border neighbours**.

Built for an interview: small surface area, server-side rules, no mock inventory.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

```bash
npm test        # route eligibility tests
npm run typecheck
npm run build
```

## The rule

```text
DOMESTIC  same country            Munich → Berlin
BORDER    countries share a border Munich → Salzburg
INVALID   everything else          Munich → London
```

- Cities provide a 2-letter country code (`DE`).
- Country `borders` provide 3-letter codes (`DEU`).
- The server normalizes both and builds a symmetric border graph, so `DE → AT`
  and `AT → DE` both work.
- A route is re-checked on the server from city IDs; the client never supplies
  or overrides a country code.

## API calls

Only two countries.dev endpoints are used:

- `GET /countries?fields=name,alpha2Code,alpha3Code,borders,flag`
- `GET /cities?q=&country=&limit=` and `GET /cities/{geonameId}`

The browser never calls countries.dev directly — all requests go through the
Next.js routes, which cache country and city data in memory.

## Our endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/geo/cities?q=&limit=&pickupCityId=` | City autocomplete. When `pickupCityId` is set, the server resolves the pick-up country and only searches it plus its land-border neighbours. |
| GET | `/api/route-check?pickupCityId=&dropoffCityId=` | Resolves both cities, classifies the route, and returns the allowed country list. |

`/api/route-check` returns HTTP 200 for a valid request, with:

```json
{
  "allowed": true,
  "relationship": "BORDER",
  "pickup": { "cityId": 2867714, "city": "Munich", "countryCode": "DE", "countryName": "Germany", "flag": "..." },
  "dropoff": { "cityId": 2766824, "city": "Salzburg", "countryCode": "AT", "countryName": "Austria", "flag": "..." },
  "allowedCountries": [{ "countryCode": "DE", "name": "Germany", "relationship": "DOMESTIC" }],
  "message": "Pick-up and drop-off are in neighbouring countries."
}
```

Try it:

```bash
curl "http://localhost:3000/api/route-check?pickupCityId=2867714&dropoffCityId=2766824"
curl "http://localhost:3000/api/route-check?pickupCityId=2867714&dropoffCityId=2643743"
```

## Project layout

```text
app/
  api/geo/cities/route.ts     # city search, restricted server-side
  api/route-check/route.ts    # route eligibility
  page.tsx
  globals.css
components/search/
  SearchApp.tsx               # two comboboxes + route result
  LocationCombobox.tsx        # debounced autocomplete
  types.ts
lib/geo/
  countries.ts                # country index, border graph, classifyRoute
  cities.ts                   # /cities search, lookup, cache, fan-out
  types.ts
tests/
  eligibility.test.ts
```

## Notes

- The rule is country-level. The UK and Ireland share a land border, so a
  `GB → IE` route is allowed even though London → Dublin crosses water. That is
  a deliberate simplification.
- If a country has no `borders` array, it is treated as having no neighbours.
- If countries.dev is unavailable the app serves stale cached data when it can,
  otherwise it fails closed (no route is allowed).
- Geo data: countries.dev / GeoNames (CC BY 4.0).
