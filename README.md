# Weather Lizard

Weather Lizard is a small static JavaScript weather app. It uses the National Weather Service API to show a four-part forecast for Morning, Afternoon, Evening, and Overnight.

The app defaults to Cincinnati, OH 45202 so the page is useful immediately, then lets the user switch to their precise browser location. It also includes Today/Tomorrow tabs, active NWS alerts, current observations, and a small release stamp for cache/debug checks.

## Run Locally

Because browser geolocation usually requires a secure context, serve the files from `localhost` instead of opening `index.html` directly.

### Option 1: Windows Helper

Double-click `start-server.bat` in the `weather-lizard` folder. It opens `http://localhost:8000` and starts a local server using `python` or `py`.

### Option 2: Python

```powershell
cd C:\Users\User\weather-lizard
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## How It Works

1. The app loads the default forecast for ZIP code 45202.
2. If the user clicks `Use my location`, the browser geolocation API provides latitude and longitude.
3. The app calls `https://api.weather.gov/points/{lat},{lon}`.
4. It follows the returned `forecastHourly` URL for hourly forecast periods.
5. It fetches the nearest station and latest observation for current conditions.
6. It calls NWS active alerts for the selected point.
7. It groups hourly periods into four forecast windows.

## Forecast Windows

- `Morning`: 6 AM - 12 PM
- `Afternoon`: 12 PM - 6 PM
- `Evening`: 6 PM - 12 AM
- `Overnight`: the upcoming 12 AM - 6 AM window

At night, the page defaults to the `Tomorrow` tab so it does not open on a mostly passed day. The `Overnight` card is treated as the upcoming overnight period, not the already-finished early morning period.

## Weather Description Rules

The app summarizes each daypart before choosing the main condition label. The rule priority is:

1. Hazardous weather
2. Meaningful precipitation
3. Extreme temperature
4. Humidity or mugginess
5. Wind
6. General sky condition

This means rain wins over humidity. For example, rain with 100% humidity is displayed as `Rainy`, not `Humid`.

Light rain wording from NWS is filtered through a threshold:

- Wet wording below 40% precipitation chance: `Mostly dry`
- 40% to 69%: `Chance of showers`
- 70% or higher: `Rainy`

Humidity uses dew point when available. If dew point is not available, the fallback is temperature at or above 75°F with humidity at or above 70%.

## Release Stamp

The bottom-right badge displays the current release:

```text
Release: YYYYMMDD-HHMM
```

The current value lives in `script.js`:

```js
const appRelease = "YYYYMMDD-HHMM";
```

The same value is also used for the cache-busting query strings in `index.html` for `styles.css`, `script.js`, and the logo assets.

The pre-commit hook described below updates these values automatically. If hooks are not enabled, update these before committing:

- `const appRelease` in `script.js`
- `?v=...` query strings in `index.html`

Example:

```text
20260531-0922
```

The format is year, month, day, dash, 24-hour local time.

## Git Hooks

This repo includes a pre-commit hook that updates the release stamp automatically before each commit.

Enable it once per local clone:

```powershell
git config core.hooksPath .githooks
```

After that, every `git commit` runs:

```powershell
scripts/update-release.ps1
```

The script updates:

- `const appRelease` in `script.js`
- all `?v=...` cache-busting query strings in `index.html`

The hook then stages `index.html` and `script.js` so the generated release stamp is included in the commit.

## Deployment Notes

This is a static site. There is no build step, bundler, or server-side application code.

Cloudflare or browser caching may hold onto old files. The release stamp and cache query strings are there to make it obvious which version is being served.
