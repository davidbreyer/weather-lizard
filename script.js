const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  statusMessage: document.querySelector("#statusMessage"),
  lastLoadedLabel: document.querySelector("#lastLoadedLabel"),
  alertsSection: document.querySelector("#alertsSection"),
  alertsList: document.querySelector("#alertsList"),
  eventForecastSection: document.querySelector("#eventForecastSection"),
  eventForecastList: document.querySelector("#eventForecastList"),
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

    setStatus("Loading alerts, current conditions, and hourly forecast...");

    const [stationUrl, hourlyForecast, alertsData] = await Promise.all([
      getNearestStationUrl(pointProperties.observationStations),
      fetchJson(pointProperties.forecastHourly),
      fetchJson(`https://api.weather.gov/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`)
    ]);

    const observation = await fetchJson(`${stationUrl}/observations/latest`);
    renderAlerts(alertsData);
    renderEventForecast(hourlyForecast);
    renderWeather(observation, nearbyLocation, stationUrl);
    renderHourlyForecast(hourlyForecast);
    hasLoadedWeather = true;
    setLastLoaded(new Date());
    setStatus("Alerts, daily moments, current conditions, and hourly forecast are loaded.", "success");
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
  elements.alertsSection.classList.remove("hidden");
  elements.alertsSection.classList.add("alerts-panel--loading");
  elements.eventForecastSection.classList.remove("hidden");
  elements.eventForecastSection.classList.add("event-forecast--loading");
  elements.weatherCard.classList.remove("hidden");
  elements.weatherCard.classList.add("weather-card--loading");
  elements.hourlyForecastSection.classList.remove("hidden");
  elements.hourlyForecastSection.classList.add("hourly-forecast--loading");

  elements.alertsList.innerHTML = Array.from({ length: 2 }, () => `
    <article class="alert-card alert-card--placeholder" aria-hidden="true">
      <h3 class="alert-card__title">Loading alert</h3>
      <p class="alert-card__chips">Loading</p>
      <p class="alert-card__meta">Loading</p>
      <p class="alert-card__summary">Loading alert details</p>
      <p class="alert-card__instruction">Loading recommended action</p>
    </article>
  `).join("");
  elements.eventForecastList.innerHTML = Array.from({ length: 6 }, () => `
    <article class="event-card event-card--placeholder" aria-hidden="true">
      <p class="event-card__eyebrow">Loading</p>
      <p class="event-card__title">Loading</p>
      <p class="event-card__verdict">Loading</p>
      <p class="event-card__detail">Loading the best forecast moments for your day.</p>
      <p class="event-card__meta">Loading details</p>
    </article>
  `).join("");
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
  elements.alertsSection.classList.add("hidden");
  elements.eventForecastSection.classList.add("hidden");
  elements.weatherCard.classList.add("hidden");
  elements.hourlyForecastSection.classList.add("hidden");
  removeLoadingClasses();
  elements.alertsList.innerHTML = "";
  elements.eventForecastList.innerHTML = "";
  elements.hourlyForecastList.innerHTML = "";
}

function removeLoadingClasses() {
  elements.alertsSection.classList.remove("alerts-panel--loading");
  elements.eventForecastSection.classList.remove("event-forecast--loading");
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

function renderAlerts(alertsData) {
  const alerts = (alertsData.features || [])
    .map((feature) => feature.properties)
    .filter(Boolean)
    .slice(0, 3);

  if (alerts.length === 0) {
    elements.alertsSection.classList.add("hidden");
    elements.alertsList.innerHTML = "";
    elements.alertsSection.classList.remove("alerts-panel--loading");
    return;
  }

  elements.alertsList.innerHTML = alerts.map((alert) => `
    <article class="alert-card alert-card--${alertSeverityTone(alert.severity)}">
      <h3 class="alert-card__title">${escapeHtml(alert.event || "Weather alert")}</h3>
      <div class="alert-card__chips">
        <span class="alert-chip alert-chip--severity-${alertSeverityTone(alert.severity)}">${escapeHtml(alert.severity || "Unknown severity")}</span>
        <span class="alert-chip">${escapeHtml(alert.urgency || "Unknown urgency")}</span>
        <span class="alert-chip">${escapeHtml(alert.certainty || "Unknown certainty")}</span>
      </div>
      <p class="alert-card__meta">
        ${escapeHtml(alert.areaDesc || "Area unavailable")}<br>
        ${formatAlertTimeRange(alert.effective, alert.expires)}
      </p>
      <p class="alert-card__summary">${escapeHtml(summarizeAlert(alert.headline || alert.description || "Alert details unavailable."))}</p>
      ${alert.instruction ? `<p class="alert-card__instruction">${escapeHtml(alert.instruction)}</p>` : ""}
    </article>
  `).join("");

  elements.alertsSection.classList.remove("alerts-panel--loading");
  elements.alertsSection.classList.remove("hidden");
}

function renderEventForecast(hourlyForecastData) {
  const periods = hourlyForecastData.properties?.periods ?? [];

  if (periods.length === 0) {
    throw new Error("No hourly forecast data was returned by the National Weather Service.");
  }

  const eventCards = [
    buildTimedEventCard("Morning commute", "Today", periods, 6, 9),
    buildTimedEventCard("Lunch", "Midday", periods, 11, 13),
    buildTimedEventCard("Afternoon commute", "Later today", periods, 16, 18),
    buildTimedEventCard("Evening & sunset", "Tonight", periods, 18, 21),
    buildPatioCard(periods),
    buildMowingCard(periods)
  ];

  elements.eventForecastList.innerHTML = eventCards.map(renderEventCard).join("");
  elements.eventForecastSection.classList.remove("event-forecast--loading");
  elements.eventForecastSection.classList.remove("hidden");
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

function buildTimedEventCard(title, eyebrow, periods, startHour, endHour) {
  const period = findBestPeriodForHours(periods, startHour, endHour) || periods[0];
  const score = scorePeriod(period);

  return {
    eyebrow,
    title,
    verdict: verdictLabel(score, false),
    detail: buildTimedEventDetail(period),
    meta: [
      `${formatHourLabel(period.startTime)} · ${formatForecastTemperature(period.temperature, period.temperatureUnit)}`,
      `Rain chance: ${formatForecastPercent(period.probabilityOfPrecipitation?.value)}`,
      `Wind: ${formatForecastWind(period.windSpeed, period.windDirection)}`
    ],
    tone: scoreTone(score)
  };
}

function buildPatioCard(periods) {
  const candidatePeriods = periods.filter((period) => {
    const hour = new Date(period.startTime).getHours();
    return hour >= 16 && hour <= 21;
  });
  const targetPeriod = bestOutdoorPeriod(candidatePeriods.length > 0 ? candidatePeriods : periods.slice(0, 6));
  const score = scoreOutdoorPeriod(targetPeriod);

  return {
    eyebrow: "Outdoor",
    title: "Patio weather",
    verdict: verdictLabel(score, true),
    detail: patioDetail(score, targetPeriod),
    meta: [
      `${formatHourLabel(targetPeriod.startTime)} · ${formatForecastTemperature(targetPeriod.temperature, targetPeriod.temperatureUnit)}`,
      `Rain chance: ${formatForecastPercent(targetPeriod.probabilityOfPrecipitation?.value)}`,
      `Wind: ${formatForecastWind(targetPeriod.windSpeed, targetPeriod.windDirection)}`
    ],
    tone: scoreTone(score)
  };
}

function buildMowingCard(periods) {
  const candidatePeriods = periods.filter((period) => {
    const hour = new Date(period.startTime).getHours();
    return hour >= 9 && hour <= 18;
  });
  const targetPeriod = bestOutdoorPeriod(candidatePeriods.length > 0 ? candidatePeriods : periods.slice(0, 8));
  const score = scoreMowingPeriod(targetPeriod);

  return {
    eyebrow: "Yard work",
    title: "Mow the lawn?",
    verdict: verdictLabel(score, true),
    detail: mowingDetail(score, targetPeriod),
    meta: [
      `${formatHourLabel(targetPeriod.startTime)} · ${formatForecastTemperature(targetPeriod.temperature, targetPeriod.temperatureUnit)}`,
      `Rain chance: ${formatForecastPercent(targetPeriod.probabilityOfPrecipitation?.value)}`,
      `Wind: ${formatForecastWind(targetPeriod.windSpeed, targetPeriod.windDirection)}`
    ],
    tone: scoreTone(score)
  };
}

function renderEventCard(card) {
  return `
    <article class="event-card event-card--${card.tone}">
      <p class="event-card__eyebrow">${card.eyebrow}</p>
      <h3 class="event-card__title">${card.title}</h3>
      <p class="event-card__verdict">${card.verdict}</p>
      <p class="event-card__detail">${card.detail}</p>
      <p class="event-card__meta">
        <span>${card.meta[0]}</span>
        <span>${card.meta[1]}</span>
        <span>${card.meta[2]}</span>
      </p>
    </article>
  `;
}

function findBestPeriodForHours(periods, startHour, endHour) {
  return periods.find((period) => {
    const hour = new Date(period.startTime).getHours();
    return hour >= startHour && hour <= endHour;
  });
}

function scorePeriod(period) {
  let score = 2;
  const precipitation = period.probabilityOfPrecipitation?.value ?? 0;
  const temperature = typeof period.temperature === "number" ? period.temperature : null;
  const windMph = parseWindSpeedMph(period.windSpeed);
  const forecastText = `${period.shortForecast || ""} ${period.detailedForecast || ""}`.toLowerCase();

  if (precipitation >= 60 || /thunder|storm|snow|ice|freezing/.test(forecastText)) {
    score -= 2;
  } else if (precipitation >= 30) {
    score -= 1;
  }

  if (windMph >= 22) {
    score -= 1;
  }

  if (temperature !== null && (temperature <= 28 || temperature >= 95)) {
    score -= 1;
  } else if (temperature !== null && (temperature <= 40 || temperature >= 88)) {
    score -= 0.5;
  }

  return Math.max(0, Math.min(3, score));
}

function scoreOutdoorPeriod(period) {
  let score = 3;
  const precipitation = period.probabilityOfPrecipitation?.value ?? 0;
  const temperature = typeof period.temperature === "number" ? period.temperature : null;
  const windMph = parseWindSpeedMph(period.windSpeed);

  if (precipitation >= 50) {
    score -= 2;
  } else if (precipitation >= 25) {
    score -= 1;
  }

  if (windMph >= 18) {
    score -= 1;
  } else if (windMph >= 12) {
    score -= 0.5;
  }

  if (temperature !== null && (temperature < 58 || temperature > 90)) {
    score -= 1;
  } else if (temperature !== null && (temperature < 65 || temperature > 84)) {
    score -= 0.5;
  }

  return Math.max(0, Math.min(3, score));
}

function scoreMowingPeriod(period) {
  let score = 3;
  const precipitation = period.probabilityOfPrecipitation?.value ?? 0;
  const temperature = typeof period.temperature === "number" ? period.temperature : null;
  const windMph = parseWindSpeedMph(period.windSpeed);

  if (precipitation >= 40) {
    score -= 2;
  } else if (precipitation >= 20) {
    score -= 1;
  }

  if (windMph >= 20) {
    score -= 1;
  } else if (windMph >= 14) {
    score -= 0.5;
  }

  if (temperature !== null && (temperature < 45 || temperature > 92)) {
    score -= 1;
  } else if (temperature !== null && (temperature < 55 || temperature > 85)) {
    score -= 0.5;
  }

  return Math.max(0, Math.min(3, score));
}

function bestOutdoorPeriod(periods) {
  return periods.reduce((best, period) => {
    if (!best) {
      return period;
    }

    return scoreOutdoorPeriod(period) > scoreOutdoorPeriod(best) ? period : best;
  }, null) || periods[0];
}

function scoreTone(score) {
  if (score >= 2.5) {
    return "good";
  }

  if (score >= 1.25) {
    return "mixed";
  }

  return "rough";
}

function verdictLabel(score, plainLanguage) {
  if (score >= 2.5) {
    return plainLanguage ? "Looks good" : "Good to go";
  }

  if (score >= 1.25) {
    return plainLanguage ? "Maybe" : "Plan ahead";
  }

  return plainLanguage ? "Probably skip" : "Rough weather";
}

function buildTimedEventDetail(period) {
  const precipitation = period.probabilityOfPrecipitation?.value;
  const wind = formatForecastWind(period.windSpeed, period.windDirection);
  const summary = period.shortForecast || "Forecast unavailable";

  return `${summary}${precipitation ? ` with a ${Math.round(precipitation)}% chance of rain` : ""}. ${wind !== "N/A" ? `Winds ${wind.toLowerCase()}.` : ""}`.trim();
}

function patioDetail(score, period) {
  if (score >= 2.5) {
    return `This looks like a solid window to sit outside, especially around ${formatHourLabel(period.startTime).toLowerCase()}.`;
  }

  if (score >= 1.25) {
    return `You could probably make patio plans, but keep an eye on wind or passing showers.`;
  }

  return `This does not look especially comfortable for patio time without a backup plan.`;
}

function mowingDetail(score, period) {
  if (score >= 2.5) {
    return `If you want to mow, ${formatHourLabel(period.startTime).toLowerCase()} looks like your best shot.`;
  }

  if (score >= 1.25) {
    return `Mowing may work, but the grass could get damp or breezy conditions could be annoying.`;
  }

  return `I'd wait for a better weather window before mowing the lawn.`;
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

function parseWindSpeedMph(windSpeed) {
  if (!windSpeed) {
    return 0;
  }

  const values = String(windSpeed).match(/\d+/g);

  if (!values || values.length === 0) {
    return 0;
  }

  const numbers = values.map(Number);
  return Math.max(...numbers);
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

function formatAlertTimeRange(effective, expires) {
  if (!effective && !expires) {
    return "Timing unavailable";
  }

  const parts = [];

  if (effective) {
    parts.push(`From ${formatDateTime(effective)}`);
  }

  if (expires) {
    parts.push(`Until ${formatDateTime(expires)}`);
  }

  return parts.join(" · ");
}

function summarizeAlert(text) {
  const cleanText = String(text).replace(/\s+/g, " ").trim();
  return cleanText.length > 240 ? `${cleanText.slice(0, 237)}...` : cleanText;
}

function alertSeverityTone(severity) {
  const normalized = String(severity || "unknown").toLowerCase();

  if (normalized === "extreme" || normalized === "severe") {
    return normalized;
  }

  if (normalized === "moderate") {
    return "moderate";
  }

  if (normalized === "minor") {
    return "minor";
  }

  return "unknown";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
