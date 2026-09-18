(function () {
  var widget = document.getElementById('weather-widget');
  var iconEl = document.getElementById('weather-icon');
  var tempEl = document.getElementById('weather-temp');

  var LAT = -33.4489, LON = -70.6693, PLACE = 'Santiago, Chile';

  var ICONS = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️',
    56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    66: '🌧️', 67: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
    80: '🌦️', 81: '🌧️', 82: '⛈️',
    85: '🌨️', 86: '🌨️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
  };

  var LABELS = {
    0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
    85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail'
  };

  function iconFor(code, isDay) {
    if (!isDay && (code === 0 || code === 1 || code === 2)) return '🌙';
    return ICONS[code] || '🌡️';
  }

  function render(data) {
    var cur = data.current;
    var temp = Math.round(cur.temperature_2m);
    var label = LABELS[cur.weather_code] || 'Weather';
    iconEl.textContent = iconFor(cur.weather_code, cur.is_day === 1);
    tempEl.textContent = temp + '°C';
    widget.title = PLACE + ' — ' + label + ', ' + temp + '°C';
    widget.classList.remove('weather-loading');
  }

  function poll() {
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
      '&current=temperature_2m,weather_code,is_day&timezone=auto',
      { cache: 'no-store' }
    )
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {
        widget.title = 'Weather unavailable';
      });
  }

  poll();
  setInterval(poll, 5 * 60 * 1000);
})();
