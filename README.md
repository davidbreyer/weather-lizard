# Weather Lizard

Weather Lizard is a small static weather app with a friendly four-part day view: Morning, Afternoon, Evening, and Overnight. It uses the National Weather Service API, defaults to Cincinnati, OH 45202, and can switch to the user's precise browser location.

The goal is to make the forecast feel quick to read. Instead of dumping raw hourly data, Weather Lizard groups the day into practical windows and chooses a human-readable condition for each one.

## Features

- Four forecast cards for Morning, Afternoon, Evening, and Overnight
- `Today` and `Tomorrow` tabs
- Default 45202 forecast so the page never opens empty
- Browser geolocation for a more precise local forecast
- Active NWS alert banner
- Current conditions and station details
- Custom Weather Lizard logo
- Mobile-friendly responsive layout
- Subtle animated weather artwork
- Bottom-right release stamp for cache/debug checks

## Local Preview

Because browser geolocation usually requires a secure context, serve the files from `localhost` instead of opening `index.html` directly.

### Windows Helper

Double-click `start-server.bat` in the project folder. It opens `http://localhost:8000` and starts a local server using `python` or `py`.

### Python

```powershell
cd C:\Users\User\weather-lizard
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Data Flow

1. Load the default forecast for ZIP code 45202.
2. If requested, get latitude and longitude from browser geolocation.
3. Call `https://api.weather.gov/points/{lat},{lon}`.
4. Follow the returned `forecastHourly` URL.
5. Fetch the nearest observation station and latest observation.
6. Fetch active NWS alerts for the point.
7. Group hourly periods into daypart cards.
8. Run the weather description rules to choose each card's main label.

## Forecast Windows

- `Morning`: 6 AM - 12 PM
- `Afternoon`: 12 PM - 6 PM
- `Evening`: 6 PM - 12 AM
- `Overnight`: upcoming 12 AM - 6 AM

The `Overnight` card means the upcoming overnight period. At 6:40 AM, for example, it points to tonight/early tomorrow rather than the early morning hours that already passed.

Late at night, the page defaults to the `Tomorrow` tab so the first view is still useful.

## Weather Description Rules

Weather Lizard summarizes each daypart, then applies the rules in priority order:

1. Hazardous weather
2. Meaningful precipitation
3. Extreme temperature
4. Humidity or mugginess
5. Wind
6. General sky condition

This keeps the headline focused. If it is raining with 100% humidity, the card says `Rainy`, not `Humid`.

### Rain Thresholds

NWS can include cautious rain wording even when the actual chance is tiny. Weather Lizard uses precipitation chance to decide whether wet weather should be the headline:

- Below 40% with wet wording: `Mostly dry`
- 40% to 69%: `Chance of showers`
- 70% or higher: `Rainy`

### Humidity

Humidity uses dew point when available. If dew point is not available, the fallback is:

```text
temperature >= 75°F and relative humidity >= 70%
```

That keeps normal overnight relative humidity from being treated as a muggy headline by itself.

## Release Stamp

The bottom-right badge displays the current release:

```text
Release: YYYYMMDD-HHMM
```

The value lives in `script.js`:

```js
const appRelease = "YYYYMMDD-HHMM";
```

The same value is used for cache-busting query strings in `index.html`.

## Git Hooks

The repo includes a pre-commit hook that updates the release stamp automatically before each commit.

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

The hook stages `index.html` and `script.js` so the generated release stamp is included in the commit.

## Deployment

This is a static site. There is no build step, bundler, or server-side application code.

Cloudflare or browser caching may hold onto old files. The release stamp and cache query strings make it obvious which version is being served.

## Repository

GitHub: [davidbreyer/weather-lizard](https://github.com/davidbreyer/weather-lizard)
