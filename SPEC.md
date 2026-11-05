# Pick-up & Drop-off Feature — Implementation Spec

**Stack:** Next.js (App Router) · TypeScript  
**Geo source:** [countries.dev](https://countries.dev) — keyless, edge-cached  
**Scope:** Two location comboboxes + two date/time inputs. No other UI widgets.

---

## 1. What we are building

A four-field search form:

| # | Field | Type |
|---|---|---|
| 1 | Pick-up city | Searchable combobox |
| 2 | Drop-off city | Searchable combobox, constrained after pick-up is chosen |
| 3 | Pick-up date & time | `<input type="datetime-local">` |
| 4 | Drop-off date & time | `<input type="datetime-local">` |

**Core constraint:** once a pick-up city is selected, the drop-off combobox must only show
cities in the same country **or** a country that shares a land border with the pick-up country.
All filtering happens on the **server**. The browser never applies its own eligibility logic.

---

## 2. External API — countries.dev

Exactly **two** countries.dev endpoints are used. Nothing else.

### 2.1 `/countries` — country list with border data

```
GET https://countries.dev/countries?fields=name,alpha2Code,alpha3Code,borders,flag
```

Called **once** at server startup (then cached for 24 h). Never called from the browser.

**What we use it for:** knowing which countries border which. The `borders` array on each
country record is the only source of truth for the neighbourhood constraint.

```jsonc
{
  "name": "Germany",
  "alpha2Code": "DE",           // used by city records
  "alpha3Code": "DEU",          // used by the borders array
  "borders": ["AUT", "BEL", "CZE", "DNK", "FRA", "LUX", "NLD", "POL", "CHE"],
  "flag": "🇩🇪"
}
```

> **Key mismatch:** city records use `alpha2Code` (2 letters); the `borders` array uses
> `alpha3Code` (3 letters). The server index must bridge both.

### 2.2 `/cities` — city search by query

```
GET https://countries.dev/cities?q={query}&country={alpha2}&limit={n}
```

Called on every debounced keystroke in either combobox. Never called from the browser —
always proxied through our own server so caching and rate limits are centralised.

- `q` — search text, minimum 2 characters
- `country` — optional single alpha-2 filter
- `limit` — maximum results (we use 8 per country call)

**Pick-up combobox:** one call, no `country` filter — search the whole world.

```
GET https://countries.dev/cities?q=mun&limit=8
```

**Drop-off combobox:** one call **per allowed country**, fired in parallel, results merged
server-side. The allowed countries come from the `/countries` border data (see §3).

```
GET https://countries.dev/cities?q=salz&country=DE&limit=8   ← pick-up country
GET https://countries.dev/cities?q=salz&country=AT&limit=8   ← each neighbour
GET https://countries.dev/cities?q=salz&country=CH&limit=8
...
```

Results are merged, deduplicated by `geonameId`, sorted by population descending, capped
at `limit`. **No filtering on the client — ever.**

---

## 3. Architecture — data flow

`/neighbours` below is **our own** Next.js route handler. It is not a countries.dev endpoint —
it reads from the server-side index already built from `/countries`.

```
Browser                        Next.js Server              countries.dev
──────────────────────────────────────────────────────────────────────
                               boot: build neighbour index  →  GET /countries (once, cached 24h)

 User types in pick-up box
 → GET /api/geo/cities          →  single call, no filter   →  GET /cities?q=mun&limit=8
   ?q=mun
 ← { cities: [...] }

 User selects pick-up city (DE)
 → GET /api/geo/countries       →  read cached index            (no upstream call)
        /DE/neighbours             getAllowed("DE")
 ← { allowedCountries:             → ["DE","AT","BE","CH",...] }
     [DE, AT, BE, CH, ...] }

 User types in drop-off box
 → GET /api/geo/cities          →  fan-out per allowed code  →  GET /cities?q=salz&country=DE
   ?q=salz                                                   →  GET /cities?q=salz&country=AT
   &allowedCountries=DE,AT,...                               →  GET /cities?q=salz&country=CH
                               ←  merge + sort by population ←
 ← { cities: [...] }
```

**The browser never decides which countries are allowed.** It receives the list from our
`/api/geo/countries/[code]/neighbours` route (which derives it from the `/countries` border
data), then forwards it verbatim to `/api/geo/cities`. The server does all filtering.

---

## 4. Neighbour index — how border resolution works

### Step 1 — fetch `/countries` once and cache

```ts
const res = await fetch(
  "https://countries.dev/countries?fields=name,alpha2Code,alpha3Code,borders,flag"
);
const rows: CountryRecord[] = await res.json();
```

### Step 2 — build two lookup maps

```ts
const byAlpha2 = new Map(rows.map(c => [c.alpha2Code.toUpperCase(), c]));
const byAlpha3 = new Map(rows.map(c => [c.alpha3Code.toUpperCase(), c]));
```

### Step 3 — build a symmetric neighbour map

```ts
const neighbours = new Map<string, Set<string>>();

for (const country of rows) {
  for (const borderAlpha3 of country.borders ?? []) {
    const neighbour = byAlpha3.get(borderAlpha3.toUpperCase());
    if (!neighbour) continue; // unknown code (e.g. Kosovo "UNK") — skip, never allow

    const a = country.alpha2Code.toUpperCase();
    const b = neighbour.alpha2Code.toUpperCase();

    // Store both directions so the relation is symmetric even if upstream is not.
    neighbours.get(a)?.add(b) ?? neighbours.set(a, new Set([b]));
    neighbours.get(b)?.add(a) ?? neighbours.set(b, new Set([a]));
  }
}
```

### Step 4 — allowed drop-off countries for a given pick-up

```ts
function getAllowed(pickupAlpha2: string): string[] {
  const code = pickupAlpha2.toUpperCase();
  return [code, ...(neighbours.get(code) ?? [])];
  // e.g. DE → ["DE", "AT", "BE", "CH", "CZ", "DK", "FR", "LU", "NL", "PL"]
}
```

### Classification

```ts
type RouteRelationship = "DOMESTIC" | "BORDER" | "INVALID";

function classifyRoute(pickup: string, dropoff: string): RouteRelationship {
  if (pickup === dropoff) return "DOMESTIC";
  if (neighbours.get(pickup)?.has(dropoff)) return "BORDER";
  return "INVALID";
}
```

---

## 5. Our server routes (Next.js route handlers)

These are routes we own inside the Next.js app. They are **not** countries.dev endpoints —
they are thin wrappers that call countries.dev internally, cache results, and expose a clean
interface to the browser. The browser calls only these; it never calls countries.dev directly.

### `GET /api/geo/countries/[code]/neighbours`

Called once when the user selects a pick-up city. Reads the already-cached country index
(built from `countries.dev/countries`) and returns which countries are allowed for drop-off.

**Request:** `GET /api/geo/countries/DE/neighbours`

**Response `200`:**
```jsonc
{
  "countryCode": "DE",
  "countryName": "Germany",
  "allowedCountries": [
    { "countryCode": "DE", "name": "Germany",  "flag": "🇩🇪", "relationship": "DOMESTIC" },
    { "countryCode": "AT", "name": "Austria",  "flag": "🇦🇹", "relationship": "BORDER"   },
    { "countryCode": "BE", "name": "Belgium",  "flag": "🇧🇪", "relationship": "BORDER"   }
    // …all neighbours
  ]
}
```

**Response `400`:** `INVALID_QUERY` — code is not two letters  
**Response `404`:** `UNKNOWN_COUNTRY` — code not found in index  
**Response `503`:** `GEO_UNAVAILABLE` — country index unavailable with no cache

---

### `GET /api/geo/cities`

Called on every keystroke (debounced 300 ms) in either combobox.

| Param | Required | Notes |
|---|---|---|
| `q` | yes | ≥ 2 chars; returns `{ cities: [] }` if shorter |
| `allowedCountries` | no | Comma-separated alpha-2 codes; triggers per-country fan-out |
| `limit` | no | 1–20, default 10 |

**Pick-up combobox** — no `allowedCountries`:
```
GET /api/geo/cities?q=mun&limit=8
→ single upstream call: /cities?q=mun&limit=8
```

**Drop-off combobox** — with `allowedCountries`:
```
GET /api/geo/cities?q=salz&allowedCountries=DE,AT,CH&limit=8
→ parallel upstream calls:
    /cities?q=salz&country=DE&limit=8
    /cities?q=salz&country=AT&limit=8
    /cities?q=salz&country=CH&limit=8
→ merge by geonameId, sort by population, return top 8
```

**Response `200`:**
```jsonc
{
  "cities": [
    {
      "geonameId": 2766824,
      "name": "Salzburg",
      "asciiName": "Salzburg",
      "countryCode": "AT",
      "countryName": "Austria",
      "flag": "🇦🇹",
      "admin1Code": "05",
      "latitude": 47.79941,
      "longitude": 13.04399,
      "population": 157245,
      "timezone": "Europe/Vienna"
    }
  ]
}
```

---

## 6. Caching

| Data | TTL | Stale behaviour |
|---|---|---|
| Country index (`/countries`) | 24 hours | Serve stale for up to 7 days on upstream failure |
| City search (`/cities?q=...`) | 24 hours | Serve stale on upstream failure |
| City by ID (`/cities/{id}`) | 7 days | Serve stale on upstream failure |

The cache is in-memory (server process). In production, replace with Redis/KV.

**Single-flight:** concurrent requests for the same key share one upstream fetch. No stampede.

**Fail-closed on eligibility:** if the country index is unavailable with no usable cache, the
`/neighbours` endpoint returns `503` and the drop-off field is restricted to the pick-up
country only. The browser never widens the allowed set on its own.

---

## 7. Client-side behaviour — `SearchApp`

```
State:
  pickup:    CityWithCountry | null
  dropoff:   CityWithCountry | null
  allowed:   AllowedCountry[]        ← received from /neighbours
  fromDate:  string                  ← datetime-local value
  toDate:    string                  ← datetime-local value

On pick-up city selected:
  1. setPickup(city)
  2. setDropoff(null)                ← always clear drop-off when pick-up changes
  3. setAllowed([{ countryCode: city.countryCode, relationship: "DOMESTIC" }])
     ↑ fail-closed: restrict to domestic until /neighbours responds
  4. fetch /api/geo/countries/{city.countryCode}/neighbours
  5. setAllowed(payload.allowedCountries)   ← expands to include neighbours

Drop-off combobox receives:
  allowedCountries = allowed.map(c => c.countryCode)
  disabled = pickup === null

Every drop-off keystroke sends:
  GET /api/geo/cities?q={text}&allowedCountries={codes}&limit=8
  ← server does the fan-out; client shows whatever comes back
```

**There is no client-side filtering.** The `allowedCountries` parameter is forwarded to the
server as a passthrough; the server decides which cities to return.

---

## 8. `LocationCombobox` component

Implements the ARIA `combobox` / `listbox` pattern.

| Behaviour | Detail |
|---|---|
| Minimum query length | 2 characters |
| Debounce | 300 ms |
| In-flight cancellation | `AbortController` — previous request aborted on new keystroke |
| Keyboard | `↑` `↓` navigate list; `Enter` selects; `Escape` closes |
| Clear button | `×` button resets value and notifies parent |
| Disabled state | Full input disabled when `disabled={true}` (drop-off before pick-up) |
| Each option shows | City name · region · country name · country flag |

---

## 9. Implementation steps

### Step 1 — Geo types (`lib/geo/types.ts`)

Define `CountryRecord`, `CountryIndex`, `CityRecord`, `CityWithCountry`, `RouteRelationship`,
and `GeoError`. These are shared between server lib and API routes.

### Step 2 — Country index (`lib/geo/countries.ts`)

- `fetchCountryIndex()` — fetch `/countries`, build `byAlpha2`, `byAlpha3`, `neighbours` maps.
- `getCountryIndex()` — singleton with 24 h cache + single-flight + stale fallback.
- `getAllowedCountryCodes(index, pickupAlpha2)` — returns `[pickup, ...neighbours]`.
- `classifyRoute(index, pickup, dropoff)` — returns `DOMESTIC | BORDER | INVALID`.

### Step 3 — City search (`lib/geo/cities.ts`)

- `fetchCitySearch(q, country?, limit)` — single upstream call with 24 h cache.
- `searchCities({ q, allowedCountries?, limit })`:
  - No `allowedCountries` → one call, no country filter (pick-up path).
  - With `allowedCountries` → parallel call per country, merge, sort by population (drop-off path).
- `getCity(geonameId)` — fetch `/cities/{id}` with 7-day cache.

### Step 4 — API route: `/api/geo/countries/[code]/neighbours`

1. Validate that `code` is two uppercase letters.
2. Load country index via `getCountryIndex()`.
3. Look up the country; `404` if not found.
4. Call `getAllowedCountryCodes()`.
5. Map each code to `{ countryCode, name, flag, relationship }`.
6. Return `200` with the list.

### Step 5 — API route: `/api/geo/cities`

1. Read `q`, `allowedCountries` (comma-split), `limit` from query params.
2. If `q.length < 2`, return `{ cities: [] }`.
3. Call `searchCities({ q, allowedCountries, limit })`.
4. Enrich each city with `countryName` and `flag` from the country index.
5. Return `{ cities: enriched }`.

### Step 6 — `LocationCombobox` component

Stateful combobox: local `query` string, `open` bool, `results[]`, `loading` bool,
`highlight` index. Fetches `/api/geo/cities` on each debounced keystroke.
Forwards selection to parent via `onChange(city)`.

### Step 7 — `SearchApp` component

Owns the four pieces of state: `pickup`, `dropoff`, `allowed`, `fromDate`, `toDate`.

- On pick-up select: set domestic-only restriction, fetch `/neighbours`, expand to full list.
- On drop-off: purely passive — `LocationCombobox` handles its own search.
- Date fields: two `<input type="datetime-local">` with defaults (tomorrow + 3 days).
- Selection summary: rendered below the grid once both cities are chosen.

---

## 10. What is explicitly out of scope

- Car search / inventory / pricing / ranking
- Sort tabs, offer cards, result pages
- Booking, payments, checkout
- Timezone conversion or rental-day billing
- Client-side eligibility checks (server is the only enforcer)
- Multiple dropdowns for country selection
- Any filtering applied in the browser before or after the API responds
