const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  statusMessage: document.querySelector("#statusMessage"),
  currentConditionsLabel: document.querySelector("#currentConditionsLabel"),
  lastLoadedLabel: document.querySelector("#lastLoadedLabel"),
  locationLabel: document.querySelector("#locationLabel"),
  dayTabs: Array.from(document.querySelectorAll("[data-day]")),
  alertsSection: document.querySelector("#alertsSection"),
  alertsTitle: document.querySelector("#alertsTitle"),
  alertsSummary: document.querySelector("#alertsSummary"),
  alertsToggle: document.querySelector("#alertsToggle"),
  alertsList: document.querySelector("#alertsList"),
  forecastGrid: document.querySelector("#forecastGrid"),
  hourlyDetails: document.querySelector("#hourlyDetails"),
  bottomStrip: document.querySelector("#bottomStrip"),
  releaseBadge: document.querySelector("#releaseBadge")
};

const appRelease = "20260603-1647";

const nwsHeaders = {
  Accept: "application/geo+json"
};

const dayParts = [
  { key: "morning", title: "Morning", label: "6 AM - 12 PM", start: 6, end: 12, midpoint: 9 },
  { key: "afternoon", title: "Afternoon", label: "12 PM - 6 PM", start: 12, end: 18, midpoint: 15 },
  { key: "evening", title: "Evening", label: "6 PM - 12 AM", start: 18, end: 24, midpoint: 20 },
  { key: "overnight", title: "Overnight", label: "12 AM - 6 AM", start: 0, end: 6, midpoint: 3 }
];

const rainConditionThreshold = 40;
const likelyRainThreshold = 70;
const windyThreshold = 30;
const breezyThreshold = 20;

const defaultLocation = {
  label: "Cincinnati, OH 45202",
  latitude: 39.1031,
  longitude: -84.5120
};

let hasLoadedWeather = false;
let activeLocationSource = "default";
let selectedDay = shouldDefaultToTomorrow() ? "tomorrow" : "today";
let latestWeatherData = null;
let activeDetailKey = null;
let currentDayPartCards = [];

elements.refreshButton.addEventListener("click", loadWeatherForCurrentLocation);
elements.alertsToggle.addEventListener("click", toggleAlerts);
elements.dayTabs.forEach((tab) => {
  tab.addEventListener("click", () => setSelectedDay(tab.dataset.day));
});

async function loadWeatherForCurrentLocation() {
  setLoadingState(true);
  const previousLocationSource = activeLocationSource;
  activeLocationSource = "precise";
  setStatus("Getting your precise location...");
  renderForecast(buildLoadingDayParts());

  try {
    const position = await getCurrentPosition();
    await loadWeatherForCoordinates({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      source: "precise"
    });
  } catch (error) {
    activeLocationSource = previousLocationSource;
    if (latestWeatherData) {
      const context = buildWeatherContext(latestWeatherData, selectedDay);
      renderForecast(context.dayPartCards);
    }
    setStatus(hasLoadedWeather ? `${error.message} Showing your last loaded forecast.` : error.message, "error");
  } finally {
    setLoadingState(false);
  }
}

async function loadDefaultWeather() {
  activeLocationSource = "default";
  setLoadingState(true);
  setStatus(`Loading default forecast for ${defaultLocation.label}...`);
  renderForecast(buildLoadingDayParts());

  try {
    await loadWeatherForCoordinates({ ...defaultLocation, source: "default" });
  } catch (error) {
    renderForecast(buildEmptyDayParts());
    elements.currentConditionsLabel.textContent = "Right now: default forecast could not load.";
    clearAlerts();
    setStatus(error.message, "error");
  } finally {
    setLoadingState(false);
  }
}

async function loadWeatherForCoordinates({ latitude, longitude, label, source }) {
  setStatus("Finding your National Weather Service forecast office...");

  const pointData = await fetchJson(
    `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`
  );

  const pointProperties = pointData.properties;
  const nearbyLocation = label || formatNearbyLocation(pointProperties.relativeLocation?.properties);

  if (!pointProperties.forecastHourly) {
    throw new Error("No hourly forecast endpoint was returned by the National Weather Service.");
  }

  setStatus("Loading hourly forecast, feels-like temperature, current conditions, and alerts...");

  const gridDataRequest = pointProperties.forecastGridData
    ? fetchJson(pointProperties.forecastGridData).catch(() => null)
    : Promise.resolve(null);

  const [stationUrl, hourlyForecast, alertsData, gridData] = await Promise.all([
    getNearestStationUrl(pointProperties.observationStations),
    fetchJson(pointProperties.forecastHourly),
    fetchJson(`https://api.weather.gov/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`),
    gridDataRequest
  ]);

  const observation = await fetchJson(`${stationUrl}/observations/latest`);
  latestWeatherData = { hourlyForecast, observation, nearbyLocation, stationUrl, gridData };
  const context = buildWeatherContext(latestWeatherData, selectedDay);

  elements.locationLabel.textContent = nearbyLocation;
  elements.currentConditionsLabel.textContent = context.currentConditions;
  renderForecast(context.dayPartCards);
  renderBottom(context.bottomStats);
  renderAlerts(alertsData);

  hasLoadedWeather = true;
  activeLocationSource = source;
  setLastLoaded(new Date());
  setStatus(
    source === "default"
      ? "Showing default forecast for 45202. Use your location for a more precise forecast."
      : "Your location-based forecast is loaded.",
    "success"
  );
}

function setSelectedDay(day) {
  selectedDay = day;
  activeDetailKey = null;
  updateDayTabs();

  if (!latestWeatherData) {
    return;
  }

  const context = buildWeatherContext(latestWeatherData, selectedDay);
  renderForecast(context.dayPartCards);
  setStatus(day === "today" ? "Showing today's forecast windows." : "Showing tomorrow's forecast windows.", "success");
}

function updateDayTabs() {
  elements.dayTabs.forEach((tab) => {
    const isActive = tab.dataset.day === selectedDay;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });
}

function buildWeatherContext(weatherData, day) {
  const { hourlyForecast, observation, nearbyLocation, stationUrl, gridData } = weatherData;
  const hourlyForecastData = hourlyForecast;
  const observationData = observation;
  const periods = hourlyForecastData.properties?.periods ?? [];

  if (periods.length === 0) {
    throw new Error("No hourly forecast data was returned by the National Weather Service.");
  }

  const observationProperties = observationData.properties ?? {};
  const anchorDate = getForecastAnchorDate(periods, day);
  const stationCode = stationUrl.split("/").pop() || "NWS";
  const currentHumidity = observationProperties.relativeHumidity?.value;
  const currentSummary = observationProperties.textDescription || "Current conditions";

  return {
    dayPartCards: dayParts.map((part) => buildDayPartCard(part, periods, anchorDate, currentHumidity, day, gridData)),
    currentConditions: `Right now: ${formatObservedTemperature(observationProperties.temperature?.value)} - ${currentSummary} - ${nearbyLocation}`,
    bottomStats: [
      ["target", "Location", nearbyLocation],
      ["drop", "Humidity", formatPercent(currentHumidity)],
      ["pressure", "Pressure", formatPressure(observationProperties.barometricPressure?.value)],
      ["visibility", "Visibility", formatVisibility(observationProperties.visibility?.value)],
      ["wind", "Station", stationCode]
    ]
  };
}

function buildDayPartCard(part, periods, anchorDate, fallbackHumidity, day, gridData) {
  const candidates = periods.filter((period) => isPeriodInDayPart(period, part, anchorDate, day));

  if (candidates.length === 0) {
    return buildUnavailableDayPartCard(part, day, anchorDate);
  }

  const representative = chooseRepresentativePeriod(candidates, part);
  const source = candidates.length > 0 ? candidates : [representative];
  const temps = source.map((period) => period.temperature).filter((value) => typeof value === "number");
  const precipValues = source
    .map((period) => period.probabilityOfPrecipitation?.value)
    .filter((value) => typeof value === "number");
  const humidityValues = source
    .map((period) => period.relativeHumidity?.value)
    .filter((value) => typeof value === "number");
  const averageTemperature = temps.length > 0 ? Math.round(average(temps)) : representative.temperature;
  const apparentTemperature = averageApparentTemperature(source, gridData);
  const description = describeWeather(source, representative, part, fallbackHumidity);
  const stats = [
    ["drop", "Rain Chance", formatForecastPercent(maxOrNull(precipValues))]
  ];

  if (shouldShowFeelsLike(averageTemperature, apparentTemperature)) {
    stats.push(["thermometer", "Feels Like", formatForecastTemperature(apparentTemperature, representative.temperatureUnit)]);
  }

  stats.push(
    ["wind", "Wind", formatForecastWind(representative.windSpeed, representative.windDirection)],
    ["drop", "Humidity", formatPercent(maxOrNull(humidityValues) ?? fallbackHumidity)]
  );

  return {
    ...part,
    temperature: formatForecastTemperature(
      averageTemperature,
      representative.temperatureUnit
    ),
    condition: description.condition,
    note: description.note,
    icon: description.icon,
    stats,
    hourlyDetails: source.map((period) => buildHourlyDetail(period, gridData))
  };
}

function buildUnavailableDayPartCard(part, day, anchorDate) {
  const isPassed = day === "today" && isDayPartPassed(part, anchorDate);
  const unavailableWindow = part.key === "overnight" ? "upcoming overnight window" : `${day} window`;
  return {
    ...part,
    temperature: "--",
    condition: isPassed ? "Passed" : "Forecast unavailable",
    state: isPassed ? "passed" : "unavailable",
    note: isPassed
      ? `${part.title} has already passed for today. Check Tomorrow for the next ${part.title.toLowerCase()} forecast.`
      : `The National Weather Service hourly feed did not include this ${unavailableWindow} yet.`,
    icon: part.key === "overnight" ? "moon" : part.key === "evening" ? "moon-cloud" : "partly",
    stats: [
      ["drop", "Rain Chance", "--"],
      ["wind", "Wind", "--"],
      ["drop", "Humidity", "--"]
    ],
    hourlyDetails: []
  };
}

function getForecastAnchorDate(periods, day) {
  const now = new Date();
  const targetDate = new Date(now);

  if (day === "tomorrow") {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const targetPeriods = periods.filter((period) => isSameCalendarDay(new Date(period.startTime), targetDate));

  if (targetPeriods.length > 0) {
    return targetDate;
  }

  return new Date(periods[0].startTime);
}

function isPeriodInDayPart(period, part, anchorDate, day) {
  const date = new Date(period.startTime);
  const targetDate = getDayPartDate(anchorDate, part);

  if (!isSameCalendarDay(date, targetDate)) {
    return false;
  }

  const hour = date.getHours();
  const inWindow = hour >= part.start && hour < part.end;

  if (!inWindow) {
    return false;
  }

  if (day === "today") {
    const now = new Date();
    return date >= startOfCurrentHour(now);
  }

  return true;
}

function isDayPartPassed(part, anchorDate) {
  const now = new Date();
  const targetDate = getDayPartDate(anchorDate, part);

  if (!isSameCalendarDay(now, targetDate)) {
    return false;
  }

  return now.getHours() >= part.end;
}

function shouldDefaultToTomorrow() {
  return new Date().getHours() >= 21;
}

function getDayPartDate(anchorDate, part) {
  const targetDate = new Date(anchorDate);

  if (part.key === "overnight") {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  return targetDate;
}

function startOfCurrentHour(date) {
  const currentHour = new Date(date);
  currentHour.setMinutes(0, 0, 0);
  return currentHour;
}

function chooseRepresentativePeriod(periods, part) {
  if (periods.length === 0) {
    return null;
  }

  return periods.reduce((best, period) => {
    const bestDistance = Math.abs(new Date(best.startTime).getHours() - part.midpoint);
    const periodDistance = Math.abs(new Date(period.startTime).getHours() - part.midpoint);
    return periodDistance < bestDistance ? period : best;
  }, periods[0]);
}

function findNextPeriodForPart(periods, part) {
  return periods.find((period) => {
    const hour = new Date(period.startTime).getHours();
    return hour >= part.start && hour < part.end;
  });
}

function averageApparentTemperature(periods, gridData) {
  const apparentValues = periods
    .map((period) => apparentTemperatureForPeriod(period, gridData))
    .filter((value) => typeof value === "number");

  return apparentValues.length > 0 ? Math.round(average(apparentValues)) : null;
}

function apparentTemperatureForPeriod(period, gridData) {
  return gridTemperatureForPeriod(gridData, "apparentTemperature", period)
    ?? gridTemperatureForPeriod(gridData, "heatIndex", period)
    ?? gridTemperatureForPeriod(gridData, "windChill", period);
}

function gridTemperatureForPeriod(gridData, propertyName, period) {
  const values = gridData?.properties?.[propertyName]?.values ?? [];
  const periodTime = new Date(period.startTime).getTime();
  const match = values.find((entry) => validTimeContains(entry.validTime, periodTime));

  if (typeof match?.value !== "number") {
    return null;
  }

  return Math.round(celsiusToFahrenheit(match.value));
}

function validTimeContains(validTime, timestamp) {
  if (!validTime || Number.isNaN(timestamp)) {
    return false;
  }

  const [startText, endOrDurationText] = String(validTime).split("/");
  const start = new Date(startText).getTime();

  if (Number.isNaN(start)) {
    return false;
  }

  if (!endOrDurationText) {
    return timestamp === start;
  }

  const end = endOrDurationText.startsWith("P")
    ? start + parseIsoDurationMs(endOrDurationText)
    : new Date(endOrDurationText).getTime();

  if (Number.isNaN(end)) {
    return false;
  }

  return timestamp >= start && timestamp < end;
}

function parseIsoDurationMs(duration) {
  const match = String(duration).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);

  if (!match) {
    return 0;
  }

  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match.map((value) => Number(value || 0));
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function shouldShowFeelsLike(temperature, apparentTemperature) {
  return typeof temperature === "number"
    && typeof apparentTemperature === "number"
    && Math.abs(apparentTemperature - temperature) >= 3;
}

function buildHourlyDetail(period, gridData) {
  const apparentTemperature = apparentTemperatureForPeriod(period, gridData);
  const feelsLike = shouldShowFeelsLike(period.temperature, apparentTemperature)
    ? formatForecastTemperature(apparentTemperature, period.temperatureUnit)
    : null;

  return {
    time: formatHourLabel(period.startTime),
    temperature: formatForecastTemperature(period.temperature, period.temperatureUnit),
    feelsLike,
    condition: conditionForHourlyPeriod(period),
    icon: iconForForecast(period.shortForecast, new Date(period.startTime).getHours() < 6 ? "overnight" : "day"),
    rainChance: formatForecastPercent(period.probabilityOfPrecipitation?.value),
    wind: formatForecastWind(period.windSpeed, period.windDirection)
  };
}

function conditionForHourlyPeriod(period) {
  const precip = period.probabilityOfPrecipitation?.value;
  const forecast = period.shortForecast || "Forecast unavailable";
  const normalized = forecast.toLowerCase();

  if (typeof precip === "number" && precip < rainConditionThreshold && /drizzle|rain|shower|storm|thunder/.test(normalized)) {
    return lowPrecipitationWeatherRule({
      forecast,
      normalizedForecast: normalized
    }).condition;
  }

  return forecast;
}

function describeWeather(periods, representative, part, fallbackHumidity) {
  const metrics = summarizeWeatherMetrics(periods, representative, fallbackHumidity);
  const rule = chooseWeatherRule(metrics);
  const note = buildWeatherNote(part, rule, metrics);

  return {
    condition: rule.condition,
    note,
    icon: iconForForecast(rule.iconForecast || rule.condition, part.key)
  };
}

function summarizeWeatherMetrics(periods, representative, fallbackHumidity) {
  const temps = periods.map((period) => period.temperature).filter((value) => typeof value === "number");
  const precipValues = periods
    .map((period) => period.probabilityOfPrecipitation?.value)
    .filter((value) => typeof value === "number");
  const humidityValues = periods
    .map((period) => period.relativeHumidity?.value)
    .filter((value) => typeof value === "number");
  const dewPointValues = periods
    .map((period) => celsiusToFahrenheit(period.dewpoint?.value))
    .filter((value) => typeof value === "number");
  const windValues = periods.map((period) => parseWindMph(period.windSpeed)).filter((value) => typeof value === "number");
  const forecast = representative.shortForecast || "Forecast unavailable";
  const normalizedForecast = forecast.toLowerCase();

  return {
    forecast,
    normalizedForecast,
    temperature: temps.length > 0 ? Math.round(average(temps)) : representative.temperature,
    precipChance: maxOrNull(precipValues),
    humidity: maxOrNull(humidityValues) ?? fallbackHumidity,
    dewPoint: maxOrNull(dewPointValues),
    windMph: maxOrNull(windValues),
    hasWetForecast: /drizzle|rain|shower|storm|thunder/.test(normalizedForecast),
    hasSnowForecast: /snow|sleet|flurr/.test(normalizedForecast),
    hasIceForecast: /ice|freezing rain/.test(normalizedForecast),
    hasFogForecast: /fog|mist/.test(normalizedForecast)
  };
}

function chooseWeatherRule(metrics) {
  const hazardRule = hazardousWeatherRule(metrics);

  if (hazardRule) {
    return hazardRule;
  }

  const precipitationRule = precipitationWeatherRule(metrics);

  if (precipitationRule) {
    return precipitationRule;
  }

  const temperatureRule = temperatureWeatherRule(metrics);

  if (temperatureRule) {
    return temperatureRule;
  }

  const humidityRule = humidityWeatherRule(metrics);

  if (humidityRule) {
    return humidityRule;
  }

  const windRule = windWeatherRule(metrics);

  if (windRule) {
    return windRule;
  }

  return skyWeatherRule(metrics);
}

function hazardousWeatherRule(metrics) {
  if (/tornado/.test(metrics.normalizedForecast)) {
    return { condition: "Tornado risk", reason: "hazard", iconForecast: "thunderstorm" };
  }

  if (/severe|thunder|storm/.test(metrics.normalizedForecast) && (metrics.precipChance ?? 0) >= rainConditionThreshold) {
    return { condition: "Stormy", reason: "hazard", iconForecast: "thunderstorm" };
  }

  if (/freezing rain|ice|sleet/.test(metrics.normalizedForecast)) {
    return { condition: "Icy", reason: "hazard", iconForecast: "freezing rain" };
  }

  if (/heavy snow|blizzard/.test(metrics.normalizedForecast)) {
    return { condition: "Heavy snow", reason: "hazard", iconForecast: "snow" };
  }

  if (/dense fog/.test(metrics.normalizedForecast)) {
    return { condition: "Dense fog", reason: "hazard", iconForecast: "fog" };
  }

  if (typeof metrics.windMph === "number" && metrics.windMph >= 40) {
    return { condition: "High wind", reason: "hazard", iconForecast: metrics.forecast };
  }

  return null;
}

function precipitationWeatherRule(metrics) {
  if (!(metrics.hasWetForecast || metrics.hasSnowForecast || metrics.hasIceForecast)) {
    return null;
  }

  if (typeof metrics.precipChance !== "number") {
    return { condition: metrics.forecast, reason: "precipitation", iconForecast: metrics.forecast };
  }

  if (metrics.precipChance < rainConditionThreshold) {
    return lowPrecipitationWeatherRule(metrics);
  }

  if (metrics.hasIceForecast) {
    return { condition: "Icy mix", reason: "precipitation", iconForecast: "freezing rain" };
  }

  if (metrics.hasSnowForecast) {
    return {
      condition: metrics.precipChance >= likelyRainThreshold ? "Snowy" : "Chance of snow",
      reason: "precipitation",
      iconForecast: "snow"
    };
  }

  if (/thunder|storm/.test(metrics.normalizedForecast)) {
    return {
      condition: metrics.precipChance >= likelyRainThreshold ? "Stormy" : "Possible storms",
      reason: "precipitation",
      iconForecast: "thunderstorm"
    };
  }

  return {
    condition: metrics.precipChance >= likelyRainThreshold ? "Rainy" : "Chance of showers",
    reason: "precipitation",
    iconForecast: "rain showers"
  };
}

function lowPrecipitationWeatherRule(metrics) {
  if (/drizzle/.test(metrics.normalizedForecast)) {
    return { condition: "Spotty drizzle", reason: "low-precipitation", iconForecast: "drizzle" };
  }

  if (/shower/.test(metrics.normalizedForecast)) {
    return { condition: "Spotty showers", reason: "low-precipitation", iconForecast: "rain showers" };
  }

  if (/thunder|storm/.test(metrics.normalizedForecast)) {
    return { condition: "Isolated storms", reason: "low-precipitation", iconForecast: "thunderstorm" };
  }

  if (/rain/.test(metrics.normalizedForecast)) {
    return { condition: "Spotty rain", reason: "low-precipitation", iconForecast: "rain" };
  }

  return { condition: "Mostly dry", reason: "low-precipitation", iconForecast: skyFallbackForecast(metrics) };
}

function temperatureWeatherRule(metrics) {
  if (typeof metrics.temperature !== "number") {
    return null;
  }

  const humid = isHumid(metrics);
  const windy = typeof metrics.windMph === "number" && metrics.windMph >= breezyThreshold;

  if (metrics.temperature >= 95) {
    return { condition: humid ? "Very hot and humid" : "Very hot", reason: "temperature", iconForecast: metrics.forecast };
  }

  if (metrics.temperature >= 88) {
    return { condition: humid ? "Hot and humid" : "Hot", reason: "temperature", iconForecast: metrics.forecast };
  }

  if (metrics.temperature <= 32) {
    return { condition: windy ? "Freezing and windy" : "Freezing", reason: "temperature", iconForecast: metrics.forecast };
  }

  if (metrics.temperature <= 45) {
    return { condition: windy ? "Cold and windy" : "Cold", reason: "temperature", iconForecast: metrics.forecast };
  }

  return null;
}

function humidityWeatherRule(metrics) {
  if (isHumid(metrics)) {
    return { condition: "Humid", reason: "humidity", iconForecast: metrics.forecast };
  }

  if (typeof metrics.dewPoint === "number" && metrics.dewPoint >= 65) {
    return { condition: "Muggy", reason: "humidity", iconForecast: metrics.forecast };
  }

  return null;
}

function windWeatherRule(metrics) {
  if (typeof metrics.windMph !== "number") {
    return null;
  }

  if (metrics.windMph >= windyThreshold) {
    return { condition: "Windy", reason: "wind", iconForecast: metrics.forecast };
  }

  if (metrics.windMph >= breezyThreshold) {
    return { condition: "Breezy", reason: "wind", iconForecast: metrics.forecast };
  }

  return null;
}

function skyWeatherRule(metrics) {
  if (metrics.hasFogForecast) {
    return { condition: "Foggy", reason: "sky", iconForecast: "fog" };
  }

  if (/overcast|cloudy/.test(metrics.normalizedForecast)) {
    return { condition: "Cloudy", reason: "sky", iconForecast: "cloudy" };
  }

  if (/partly|mostly clear|mostly sunny/.test(metrics.normalizedForecast)) {
    return { condition: metrics.forecast, reason: "sky", iconForecast: metrics.forecast };
  }

  if (/sunny|clear/.test(metrics.normalizedForecast)) {
    return { condition: metrics.forecast, reason: "sky", iconForecast: metrics.forecast };
  }

  return { condition: metrics.forecast, reason: "sky", iconForecast: metrics.forecast };
}

function buildWeatherNote(part, rule, metrics) {
  const partPhrases = {
    morning: "A practical look at how the day starts.",
    afternoon: "The warmest and brightest part of the day.",
    evening: "A quick read on plans after work.",
    overnight: "What to expect while the night settles in."
  };
  const detail = weatherDetailForRule(rule, metrics);

  return `${partPhrases[part.key]} ${detail}`.trim();
}

function weatherDetailForRule(rule, metrics) {
  const rainText = typeof metrics.precipChance === "number" ? `${Math.round(metrics.precipChance)}%` : null;
  const tempText = typeof metrics.temperature === "number" ? `${Math.round(metrics.temperature)}°F` : null;
  const humidityText = typeof metrics.humidity === "number" ? `${Math.round(metrics.humidity)}% humidity` : null;
  const windText = typeof metrics.windMph === "number" ? `${Math.round(metrics.windMph)} mph wind` : null;

  if (rule.reason === "hazard") {
    return `${rule.condition} is the main thing to watch.${rainText ? ` Rain chance is ${rainText}.` : ""}`;
  }

  if (rule.reason === "precipitation") {
    const subject = rule.condition === "Rainy"
      ? "Rain"
      : rule.condition === "Snowy"
        ? "Snow"
        : rule.condition === "Stormy"
          ? "Storms"
          : rule.condition;
    return `${subject} is the main story${rainText ? ` with a ${rainText} precipitation chance` : ""}.`;
  }

  if (rule.reason === "low-precipitation") {
    if (rule.condition === "Mostly dry") {
      return `${metrics.forecast} is in the raw forecast, but the rain chance is only ${rainText}.`;
    }

    return `${rule.condition} may still affect outdoor plans, even with only a ${rainText} rain chance.`;
  }

  if (rule.reason === "temperature") {
    return `${rule.condition} conditions lead the forecast${tempText ? ` around ${tempText}` : ""}.`;
  }

  if (rule.reason === "humidity") {
    return `The air may feel ${rule.condition.toLowerCase()}${humidityText ? ` with ${humidityText}` : ""}.`;
  }

  if (rule.reason === "wind") {
    return `${rule.condition} conditions stand out${windText ? ` with about ${windText}` : ""}.`;
  }

  return `${rule.condition}.`;
}

function isHumid(metrics) {
  if (typeof metrics.dewPoint === "number" && metrics.dewPoint >= 70) {
    return true;
  }

  return typeof metrics.temperature === "number"
    && typeof metrics.humidity === "number"
    && metrics.temperature >= 75
    && metrics.humidity >= 70;
}

function skyFallbackForecast(metrics) {
  if (/cloud|overcast|fog|mist/.test(metrics.normalizedForecast)) {
    return metrics.forecast;
  }

  return /clear|sunny/.test(metrics.normalizedForecast) ? metrics.forecast : "partly cloudy";
}

function parseWindMph(speed) {
  const matches = String(speed || "").match(/\d+/g);

  if (!matches) {
    return null;
  }

  return Math.max(...matches.map(Number));
}

function celsiusToFahrenheit(celsius) {
  if (typeof celsius !== "number") {
    return null;
  }

  return (celsius * 9) / 5 + 32;
}

function renderForecast(cards) {
  currentDayPartCards = cards;

  if (activeDetailKey && !cards.some((card) => card.key === activeDetailKey && card.hourlyDetails?.length > 0)) {
    activeDetailKey = null;
  }

  elements.forecastGrid.innerHTML = cards.map((card) => `
    <article
      class="quad ${card.key}${card.state ? ` quad--${card.state}` : ""}${card.key === activeDetailKey ? " quad--active" : ""}"
      data-part="${escapeHtml(card.key)}"
      ${tileInteractionAttributes(card)}
    >
      <div class="quad-content">
        <div class="time">
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.label)}</p>
        </div>
        <div class="temperature">
          <div class="temp">${escapeHtml(card.temperature)}</div>
          <div class="condition">${escapeHtml(card.condition)}</div>
          <p class="note">${escapeHtml(card.note)}</p>
        </div>
        <div class="weather-art">${weatherIcon(card.icon)}</div>
        <div class="stats">${makeStats(card.stats)}</div>
      </div>
    </article>
  `).join("");
  bindForecastTiles();
  renderHourlyDetails();
}

function tileInteractionAttributes(card) {
  if (!card.hourlyDetails?.length) {
    return 'aria-disabled="true"';
  }

  return [
    'role="button"',
    'tabindex="0"',
    `aria-expanded="${card.key === activeDetailKey}"`,
    `aria-label="${escapeHtml(`${card.title} hourly forecast`)}"`
  ].join(" ");
}

function bindForecastTiles() {
  elements.forecastGrid.querySelectorAll("[data-part]").forEach((tile) => {
    const card = currentDayPartCards.find((candidate) => candidate.key === tile.dataset.part);

    if (!card?.hourlyDetails?.length) {
      return;
    }

    tile.addEventListener("click", () => setActiveDetailKey(card.key));
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActiveDetailKey(card.key);
      }
    });
  });
}

function setActiveDetailKey(key) {
  const nextKey = activeDetailKey === key ? null : key;
  activeDetailKey = nextKey;
  renderForecast(currentDayPartCards);

  if (nextKey) {
    scrollHourlyDetailsIntoView();
  }
}

function scrollHourlyDetailsIntoView() {
  if (!elements.hourlyDetails || elements.hourlyDetails.classList.contains("hidden")) {
    return;
  }

  scrollElementIntoView(elements.hourlyDetails, "start");
}

function scrollForecastTileIntoView(key) {
  const tile = elements.forecastGrid.querySelector(`[data-part="${key}"]`);

  if (tile) {
    scrollElementIntoView(tile, "center");
  }
}

function scrollElementIntoView(element, block) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block
  });
}

function renderHourlyDetails() {
  const card = currentDayPartCards.find((candidate) => candidate.key === activeDetailKey);

  if (!card?.hourlyDetails?.length) {
    elements.hourlyDetails.classList.add("hidden");
    elements.hourlyDetails.innerHTML = "";
    return;
  }

  elements.hourlyDetails.classList.remove("hidden");
  elements.hourlyDetails.innerHTML = `
    <div class="hourly-details-header">
      <div>
        <h2>${escapeHtml(card.title)} by hour</h2>
        <p>${escapeHtml(card.label)}</p>
      </div>
      <button class="hourly-close" type="button" aria-label="Close hourly forecast">Close</button>
    </div>
    <div class="hourly-grid">
      ${card.hourlyDetails.map((hour) => `
        <article class="hour-card">
          <div class="hour-card-top">
            <strong>${escapeHtml(hour.time)}</strong>
            <span class="hour-icon">${weatherIcon(hour.icon)}</span>
          </div>
          <div class="hour-temp">${escapeHtml(hour.temperature)}</div>
          <div class="hour-condition">${escapeHtml(hour.condition)}</div>
          <div class="hour-metrics">
            ${hour.feelsLike ? `<span>Feels ${escapeHtml(hour.feelsLike)}</span>` : ""}
            <span>Rain ${escapeHtml(hour.rainChance)}</span>
            <span>${escapeHtml(hour.wind)}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;

  elements.hourlyDetails.querySelector(".hourly-close").addEventListener("click", () => {
    const closingKey = activeDetailKey;
    activeDetailKey = null;
    renderForecast(currentDayPartCards);
    scrollForecastTileIntoView(closingKey);
  });
}

function renderBottom(stats) {
  elements.bottomStrip.innerHTML = stats.map(([icon, label, value]) => `
    <div class="mini-stat">
      <span aria-hidden="true">${icons[icon] || ""}</span>
      <div>
        <span class="mini-label">${escapeHtml(label)}</span>
        <span class="mini-value">${escapeHtml(value)}</span>
      </div>
    </div>
  `).join("");
}

function renderAlerts(alertsData) {
  const alerts = (alertsData.features || [])
    .map((feature) => feature.properties)
    .filter(Boolean)
    .slice(0, 3);

  if (alerts.length === 0) {
    clearAlerts();
    return;
  }

  elements.alertsTitle.textContent = alerts.length === 1 ? "1 active alert" : `${alerts.length} active alerts`;
  elements.alertsSummary.textContent = alerts.map((alert) => alert.event).filter(Boolean).join(" · ");
  elements.alertsList.innerHTML = alerts.map((alert) => `
    <article class="alert-card alert-card--${alertSeverityTone(alert.severity)}">
      <h3>${escapeHtml(alert.event || "Weather alert")}</h3>
      <p>${escapeHtml(alert.areaDesc || "Area unavailable")}</p>
      <p>${escapeHtml(summarizeAlert(alert.headline || alert.description || "Alert details unavailable."))}</p>
    </article>
  `).join("");
  elements.alertsSection.classList.remove("hidden");
}

function clearAlerts() {
  elements.alertsSection.classList.add("hidden");
  elements.alertsList.innerHTML = "";
  elements.alertsList.hidden = true;
  elements.alertsToggle.setAttribute("aria-expanded", "false");
  elements.alertsToggle.textContent = "Show details";
}

function toggleAlerts() {
  const isExpanded = elements.alertsToggle.getAttribute("aria-expanded") === "true";
  elements.alertsToggle.setAttribute("aria-expanded", String(!isExpanded));
  elements.alertsToggle.textContent = isExpanded ? "Show details" : "Hide details";
  elements.alertsList.hidden = isExpanded;
}

function setLoadingState(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.querySelector("span:last-child").textContent = isLoading
    ? "Loading..."
    : hasLoadedWeather && activeLocationSource === "precise"
      ? "Refresh weather"
      : "Use my location";
}

function setStatus(message, type = "info") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-message--${type}`;
}

function setLastLoaded(date) {
  elements.lastLoadedLabel.textContent = `NWS data refreshed ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)}.`;
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
    response = await fetch(url, { headers: nwsHeaders });
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

function buildEmptyDayParts() {
  const emptyCopy = {
    morning: {
      condition: "Ready when you are",
      note: "Use your location to pull the first local forecast window."
    },
    afternoon: {
      condition: "Local forecast pending",
      note: "The afternoon card will fill with NWS temperature, wind, and rain chance."
    },
    evening: {
      condition: "Plans start here",
      note: "Evening details will appear after location access is allowed."
    },
    overnight: {
      condition: "Night forecast pending",
      note: "Overnight conditions will load from the hourly NWS forecast."
    }
  };

  return dayParts.map((part) => ({
    ...part,
    temperature: "--",
    condition: emptyCopy[part.key].condition,
    note: emptyCopy[part.key].note,
    icon: part.key === "overnight" ? "moon" : part.key === "evening" ? "moon-cloud" : "partly",
    stats: [
      ["drop", "Rain Chance", "--"],
      ["wind", "Wind", "--"],
      ["drop", "Humidity", "--"]
    ]
  }));
}

function buildLoadingDayParts() {
  return dayParts.map((part) => ({
    ...part,
    temperature: "--",
    condition: "Loading",
    note: "Pulling fresh National Weather Service data for your location.",
    icon: part.key === "overnight" ? "moon" : part.key === "afternoon" ? "sun" : "partly",
    stats: [
      ["drop", "Rain Chance", "--"],
      ["wind", "Wind", "--"],
      ["drop", "Humidity", "--"]
    ]
  }));
}

function formatNearbyLocation(location) {
  if (!location) {
    return "Your area";
  }

  const city = location.city || "Your area";
  const state = location.state ? `, ${location.state}` : "";
  return `${city}${state}`;
}

function formatHourLabel(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric"
  }).format(date);
}

function formatForecastTemperature(value, unit) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${Math.round(value)}°${unit || "F"}`;
}

function formatObservedTemperature(celsius) {
  if (typeof celsius !== "number") {
    return "--";
  }

  const fahrenheit = (celsius * 9) / 5 + 32;
  return `${Math.round(fahrenheit)}°F`;
}

function formatForecastPercent(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "N/A";
}

function formatForecastWind(speed, direction) {
  if (!speed && !direction) {
    return "N/A";
  }

  return `${direction || ""} ${speed || ""}`.trim();
}

function formatPercent(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "--";
}

function formatVisibility(meters) {
  if (typeof meters !== "number") {
    return "--";
  }

  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function formatPressure(pascals) {
  if (typeof pascals !== "number") {
    return "--";
  }

  const inchesMercury = pascals * 0.0002953;
  return `${inchesMercury.toFixed(2)} inHg`;
}

function summarizeAlert(text) {
  const cleanText = String(text).replace(/\s+/g, " ").trim();
  return cleanText.length > 220 ? `${cleanText.slice(0, 217)}...` : cleanText;
}

function alertSeverityTone(severity) {
  const normalized = String(severity || "unknown").toLowerCase();

  if (normalized === "extreme" || normalized === "severe") {
    return "severe";
  }

  if (normalized === "moderate") {
    return "moderate";
  }

  if (normalized === "minor") {
    return "minor";
  }

  return "unknown";
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxOrNull(values) {
  return values.length > 0 ? Math.max(...values) : null;
}

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function iconForForecast(forecast = "", partKey) {
  const normalized = forecast.toLowerCase();

  if (partKey === "overnight" && !/cloud|rain|storm|snow|fog/.test(normalized)) {
    return "moon";
  }

  if (/thunder|storm|rain|showers|drizzle|snow|sleet|ice|freezing/.test(normalized)) {
    return partKey === "overnight" ? "moon-cloud" : "partly";
  }

  if (/cloud|overcast|fog|mist/.test(normalized)) {
    return partKey === "evening" || partKey === "overnight" ? "moon-cloud" : "partly";
  }

  if (partKey === "evening") {
    return "moon-cloud";
  }

  return partKey === "overnight" ? "moon" : "sun";
}

function makeStats(stats) {
  return stats.map(([icon, label, value]) => `
    <div class="metric">
      <span aria-hidden="true">${icons[icon] || ""}</span>
      <div>
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
      </div>
    </div>
  `).join("");
}

function weatherIcon(name) {
  const sun = `<g><circle cx="88" cy="50" r="34" class="sun-core"/><path d="M88 1v22M88 77v22M39 50h22M115 50h22M53 15l16 16M123 15l-16 16M53 85l16-16M123 85l-16-16" class="sun-ray"/></g>`;
  const cloud = `<path class="cloud" d="M52 119h75c19 0 34-14 34-31s-15-31-34-31c-5 0-10 1-14 3C106 43 91 32 72 32c-24 0-43 19-43 43v2C17 80 8 91 8 103c0 10 9 16 20 16h24Z"/>`;

  if (name === "sun") {
    return `<svg viewBox="0 0 176 150" aria-hidden="true">${sun}</svg>`;
  }

  if (name === "moon") {
    return `<svg viewBox="0 0 176 150" aria-hidden="true"><path class="moon" d="M112 15c-37 8-63 41-57 79 6 37 41 62 78 55-18-11-31-29-35-51-5-32 1-57 14-83Z"/></svg>`;
  }

  if (name === "moon-cloud") {
    return `<svg viewBox="0 0 176 150" aria-hidden="true"><path class="moon" d="M102 4c-34 8-58 39-52 74 6 34 38 57 72 51-17-10-29-27-32-47-4-29 1-52 12-78Z"/><path d="M134 22v10M134 52v10M114 42h10M144 42h10" stroke="#fff" stroke-linecap="round" stroke-width="4"/>${cloud.replace('d="M52', 'd="M64')}</svg>`;
  }

  return `<svg viewBox="0 0 176 150" aria-hidden="true">${sun}${cloud}</svg>`;
}

const icons = {
  pin: `<svg width="30" height="40" viewBox="0 0 30 40" fill="none" aria-hidden="true"><path d="M15 38S3 24.4 3 15A12 12 0 0 1 27 15c0 9.4-12 23-12 23Z" stroke="currentColor" stroke-width="3"/><circle cx="15" cy="15" r="4" stroke="currentColor" stroke-width="3"/></svg>`,
  target: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>`,
  thermometer: `<svg width="24" height="30" viewBox="0 0 24 30" fill="none" aria-hidden="true"><path d="M9 17.5V5a3 3 0 0 1 6 0v12.5a6 6 0 1 1-6 0Z" stroke="currentColor" stroke-width="2.2"/><path d="M12 8v12" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/><circle cx="12" cy="23" r="2.5" fill="currentColor"/></svg>`,
  drop: `<svg width="27" height="32" viewBox="0 0 28 34" fill="none" aria-hidden="true"><path d="M14 2S4 15 4 22a10 10 0 0 0 20 0C24 15 14 2 14 2Z" stroke="currentColor" stroke-width="2.2"/><path d="M10 25c.9 2.2 2.5 3.3 5 3.3" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>`,
  wind: `<svg width="31" height="27" viewBox="0 0 34 28" fill="none" aria-hidden="true"><path d="M2 8h19c4 0 6-2 6-5 0-2-1.4-3-3.2-3-1.7 0-3 1.1-3.4 2.7M2 15h28M2 22h17c3.4 0 5 1.6 5 4 0 1.8-1.3 3-3 3-1.5 0-2.7-.9-3.2-2.1" stroke="currentColor" stroke-linecap="round" stroke-width="2.3"/></svg>`,
  pressure: `<svg width="48" height="48" viewBox="0 0 58 58" fill="none" aria-hidden="true"><path d="M8 38a22 22 0 1 1 42 0" stroke="#21a044" stroke-width="3"/><path d="M29 38 41 22" stroke="#21a044" stroke-linecap="round" stroke-width="3"/><circle cx="29" cy="38" r="4" fill="#21a044"/><path d="M14 39h6M38 39h6M29 15v6M17 24l5 3M41 24l-5 3" stroke="#21a044" stroke-linecap="round" stroke-width="3"/></svg>`,
  visibility: `<svg width="52" height="42" viewBox="0 0 64 48" fill="none" aria-hidden="true"><path d="M4 24s10-15 28-15 28 15 28 15-10 15-28 15S4 24 4 24Z" stroke="#1784da" stroke-width="3"/><circle cx="32" cy="24" r="8" stroke="#1784da" stroke-width="3"/><circle cx="32" cy="24" r="3" fill="#1784da"/></svg>`
};

function mountIcons() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    const icon = icons[node.dataset.icon];
    if (icon) {
      node.innerHTML = icon;
    }
  });
}

function renderReleaseBadge() {
  if (elements.releaseBadge) {
    elements.releaseBadge.textContent = `Release: ${appRelease}`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

mountIcons();
renderReleaseBadge();
updateDayTabs();
renderForecast(buildEmptyDayParts());
renderBottom([
  ["target", "Source", "NWS"],
  ["drop", "Humidity", "--"],
  ["pressure", "Pressure", "--"],
  ["visibility", "Visibility", "--"],
  ["wind", "Station", "--"]
]);
loadDefaultWeather();
