# Weather Lizard

Weather Lizard is a small static JavaScript site that uses browser geolocation and the National Weather Service API to show the latest nearby observation and an hourly forecast.

## Run locally

Because browser geolocation usually requires a secure context, serve the files from `localhost` instead of opening `index.html` directly.

### Option 0: Double-click on Windows

Double-click `start-server.bat` in the `weather-lizard` folder. It will open `http://localhost:8000` in your default browser, then start the local server using `python` or `py`.

### Option 1: Python

```powershell
cd C:\Users\User\weather-lizard
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## How it works

1. The page asks the browser for your current latitude and longitude.
2. It calls `https://api.weather.gov/points/{lat},{lon}`.
3. It reads the nearby observation station list returned by the API.
4. It fetches the latest observation from the first nearby station.
5. It follows the `forecastHourly` URL from the point lookup and displays the next 12 hours of forecast data.
