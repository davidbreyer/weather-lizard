const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  statusMessage: document.querySelector("#statusMessage"),
  lastLoadedLabel: document.querySelector("#lastLoadedLabel"),
  weatherCard: document.querySelector("#weatherCard"),
  hourlyForecastSection: document.querySelector("#hourlyForecastSection"),
  hourlyForecastList: document.querySelector("#hourlyForecastList"),
  locationLabel: document.querySelector("#locationLabel"),
  summaryLabel: document.querySelector("#summaryLabel"),
  temperatureLabel: document.querySelector("#temperatureLabel"),
  conditionValue: document.querySelector("#conditionValue"),
  windValue: document.querySelector("#windValue"),
  humidityValue: document.querySelector("#humidityValue"),
  visibilityValue: document.querySelector("#visibilityValue"),
  stationValue: document.querySelector("#stationValue"),
  updatedValue: document.querySelector("#updatedValue")
};

const nwsHeaders = {
  Accept: "application/geo+json"
};

let hasLoadedWeather = false;

elements.refreshButton.addEventListener("click", loadWeather);

async function loadWeather() {
  setLoadingState(true);
  setStatus(hasLoadedWeather ? "Refreshing your local weather..." : "Getting your location...");

  if (!hasLoadedWeather) {
    showLoadingSkeletons();
  }

  try {
    const position = await getCurrentPosition();
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    setStatus("Finding the nearest weather station...");

    const pointData = await fetchJson(
      `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`
    );

    const pointProperties = pointData.properties;
    const nearbyLocation = formatNearbyLocation(pointData.properties.relativeLocation?.properties);

    if (!pointProperties.forecastHourly) {
      throw new Error("No hourly forecast endpoint was returned by the National Weather Service.");
    }

    setStatus("Loading current conditions and hourly forecast...");

    const [stationUrl, hourlyForecast] = await Promise.all([
      getNearestStationUrl(pointProperties.observationStations),
      fetchJson(pointProperties.forecastHourly)
    ]);

    const observation = await fetchJson(`${stationUrl}/observations/latest`);
    renderWeather(observation, nearbyLocation, stationUrl);
    renderHourlyForecast(hourlyForecast);
    hasLoadedWeather = true;
    setLastLoaded(new Date());
    setStatus("Current conditions and hourly forecast loaded.", "success");
  } catch (error) {
    if (!hasLoadedWeather) {
      clearWeatherDisplay();
    } else {
      removeLoadingClasses();
    }

    setStatus(hasLoadedWeather ? `${error.message} Showing your last loaded weather data.` : error.message, "error");
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "Loading..." : hasLoadedWeather ? "Refresh weather" : "Get my weather";
}

function setStatus(message, type = "info") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-message--${type}`;
}

function setLastLoaded(date) {
  elements.lastLoadedLabel.textContent = `Last refreshed ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)}.`;
}

function showLoadingSkeletons() {
  elements.weatherCard.classList.remove("hidden");
  elements.weatherCard.classList.add("weather-card--loading");
  elements.hourlyForecastSection.classList.remove("hidden");
  elements.hourlyForecastSection.classList.add("hourly-forecast--loading");

  elements.locationLabel.textContent = "Loading nearby location";
  elements.summaryLabel.textContent = "Loading current conditions";
  elements.temperatureLabel.textContent = "--";
  elements.conditionValue.textContent = "Loading";
  elements.windValue.textContent = "Loading";
  elements.humidityValue.textContent = "Loading";
  elements.visibilityValue.textContent = "Loading";
  elements.stationValue.textContent = "Loading";
  elements.updatedValue.textContent = "Loading";
  elements.hourlyForecastList.innerHTML = Array.from({ length: 6 }, () => `
    <article class="hour-card hour-card--placeholder" aria-hidden="true">
      <p class="hour-card__time">Loading</p>
      <p class="hour-card__temp">--</p>
      <p class="hour-card__summary">Loading hourly forecast</p>
      <p class="hour-card__meta"><span>Loading</span><span>Loading</span></p>
    </article>
  `).join("");
}

function clearWeatherDisplay() {
  elements.weatherCard.classList.add("hidden");
  elements.hourlyForecastSection.classList.add("hidden");
  removeLoadingClasses();
  elements.hourlyForecastList.innerHTML = "";
}

function removeLoadingClasses() {
  elements.weatherCard.classList.remove("weather-card--loading");
  elements.hourlyForecastSection.classList.remove("hourly-forecast--loading");
}

function getCurrentPosition() {
  if (!("geolocation" in navigator)) {
    throw new Error("This browser does not support geolocation.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const locationErrors = {
        1: "Location access was denied. Please allow location access in your browser settings and try again.",
        2: "Your location could not be determined. Please try again.",
        3: "Location lookup timed out. Please try again."
      };

      reject(new Error(locationErrors[error.code] || "Unable to read your location."));
    }, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  });
}

async function getNearestStationUrl(stationsUrl) {
  const stationsData = await fetchJson(stationsUrl);
  const stationUrl = stationsData.observationStations?.[0];

  if (!stationUrl) {
    throw new Error("No nearby weather station was returned by the National Weather Service.");
  }

  return stationUrl;
}

async function fetchJson(url) {
  let response;

  try {
    response = await fetch(url, {
      headers: nwsHeaders
    });
  } catch (error) {
    throw new Error("The weather service could not be reached. Please check your connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Weather data was not available for your location.");
    }

    if (response.status === 429) {
      throw new Error("The weather service is busy right now. Please wait a moment and try again.");
    }

    if (response.status >= 500) {
      throw new Error("The weather service is temporarily unavailable. Please try again soon.");
    }

    throw new Error(`Weather request failed with status ${response.status}.`);
  }

  return response.json();
}

function renderWeather(observationData, nearbyLocation, stationUrl) {
  const properties = observationData.properties;
  const stationCode = stationUrl.split("/").pop() || "Unknown";
  const summary = properties.textDescription || "Current conditions";
  const temperatureC = properties.temperature?.value;
  const relativeHumidity = properties.relativeHumidity?.value;
  const visibilityM = properties.visibility?.value;

  elements.locationLabel.textContent = nearbyLocation;
  elements.summaryLabel.textContent = summary;
  elements.temperatureLabel.textContent = formatTemperature(temperatureC);
  elements.conditionValue.textContent = summary;
  elements.windValue.textContent = formatWind(
    properties.windDirection?.value,
    properties.windSpeed?.value,
    properties.windGust?.value
  );
  elements.humidityValue.textContent = formatPercent(relativeHumidity);
  elements.visibilityValue.textContent = formatVisibility(visibilityM);
  elements.stationValue.textContent = stationCode;
  elements.updatedValue.textContent = formatDateTime(properties.timestamp);
  removeLoadingClasses();
  elements.weatherCard.classList.remove("hidden");
}

function renderHourlyForecast(hourlyForecastData) {
  const periods = hourlyForecastData.properties?.periods?.slice(0, 12);

  if (!periods || periods.length === 0) {
    throw new Error("No hourly forecast data was returned by the National Weather Service.");
  }

  elements.hourlyForecastList.innerHTML = periods.map((period) => `
    <article class="hour-card">
      <p class="hour-card__time">${formatHourLabel(period.startTime)}</p>
      <p class="hour-card__temp">${formatForecastTemperature(period.temperature, period.temperatureUnit)}</p>
      <p class="hour-card__summary">${period.shortForecast || "Forecast unavailable"}</p>
      <p class="hour-card__meta">
        <span>Rain chance: ${formatForecastPercent(period.probabilityOfPrecipitation?.value)}</span>
        <span>Wind: ${formatForecastWind(period.windSpeed, period.windDirection)}</span>
      </p>
    </article>
  `).join("");

  elements.hourlyForecastSection.classList.remove("hourly-forecast--loading");
  elements.hourlyForecastSection.classList.remove("hidden");
}

function formatNearbyLocation(location) {
  if (!location) {
    return "Your area";
  }

  const city = location.city || "Your area";
  const state = location.state ? `, ${location.state}` : "";
  return `${city}${state}`;
}

function formatTemperature(celsius) {
  if (typeof celsius !== "number") {
    return "Unavailable";
  }

  const fahrenheit = (celsius * 9) / 5 + 32;
  return `${Math.round(fahrenheit)}°F`;
}

function formatForecastTemperature(value, unit) {
  if (typeof value !== "number") {
    return "Unavailable";
  }

  return `${Math.round(value)}°${unit || "F"}`;
}

function formatWind(directionDegrees, metersPerSecond, gustMetersPerSecond) {
  if (typeof metersPerSecond !== "number") {
    return "Unavailable";
  }

  const direction = formatWindDirection(directionDegrees);
  const speedMph = metersPerSecond * 2.23694;
  const gust = typeof gustMetersPerSecond === "number"
    ? `, gusts ${Math.round(gustMetersPerSecond * 2.23694)} mph`
    : "";

  return `${direction} at ${Math.round(speedMph)} mph${gust}`;
}

function formatWindDirection(degrees) {
  if (typeof degrees !== "number") {
    return "Wind";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % directions.length;
  return directions[index];
}

function formatPercent(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "Unavailable";
}

function formatForecastPercent(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "N/A";
}

function formatForecastWind(speed, direction) {
  if (!speed && !direction) {
    return "N/A";
  }

  return `${speed || ""} ${direction || ""}`.trim();
}

function formatVisibility(meters) {
  if (typeof meters !== "number") {
    return "Unavailable";
  }

  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function formatHourLabel(timestamp) {
  if (!timestamp) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric"
  }).format(new Date(timestamp));
}
