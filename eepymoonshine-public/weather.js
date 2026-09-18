(function () {
  var widget = document.getElementById('weather-widget');
  if (!widget) return;
  var iconEl = document.getElementById('weather-icon');
  var tempEl = document.getElementById('weather-temp');

  var LAT = -33.4489, LON = -70.6693, PLACE = 'Santiago, Chile';

  var WEATHER_CODES = {
    0: { icon: '☀️', label: 'Clear sky' },
    1: { icon: '🌤️', label: 'Mostly clear' },
    2: { icon: '⛅', label: 'Partly cloudy' },
    3: { icon: '☁️', label: 'Overcast' },
    45: { icon: '🌫️', label: 'Fog' },
    48: { icon: '🌫️', label: 'Depositing rime fog' },
    51: { icon: '🌦️', label: 'Light drizzle' },
    53: { icon: '🌦️', label: 'Drizzle' },
    55: { icon: '🌦️', label: 'Dense drizzle' },
    56: { icon: '🌧️', label: 'Freezing drizzle' },
    57: { icon: '🌧️', label: 'Freezing drizzle' },
    61: { icon: '🌧️', label: 'Light rain' },
    63: { icon: '🌧️', label: 'Rain' },
    65: { icon: '🌧️', label: 'Heavy rain' },
    66: { icon: '🌧️', label: 'Freezing rain' },
    67: { icon: '🌧️', label: 'Freezing rain' },
    71: { icon: '🌨️', label: 'Light snow' },
    73: { icon: '🌨️', label: 'Snow' },
    75: { icon: '🌨️', label: 'Heavy snow' },
    77: { icon: '🌨️', label: 'Snow grains' },
    80: { icon: '🌦️', label: 'Rain showers' },
    81: { icon: '🌧️', label: 'Rain showers' },
    82: { icon: '⛈️', label: 'Violent rain showers' },
    85: { icon: '🌨️', label: 'Snow showers' },
    86: { icon: '🌨️', label: 'Snow showers' },
    95: { icon: '⛈️', label: 'Thunderstorm' },
    96: { icon: '⛈️', label: 'Thunderstorm w/ hail' },
    99: { icon: '⛈️', label: 'Thunderstorm w/ hail' }
  };
  var NIGHT_CODES = { 0: true, 1: true, 2: true };

  function iconFor(code, isDay) {
    if (!isDay && NIGHT_CODES[code]) return '🌙';
    return (WEATHER_CODES[code] || {}).icon || '🌡️';
  }

  function labelFor(code) {
    return (WEATHER_CODES[code] || {}).label || 'Weather';
  }

  function render(data) {
    var cur = data.current;
    var temp = Math.round(cur.temperature_2m);
    iconEl.textContent = iconFor(cur.weather_code, cur.is_day === 1);
    tempEl.textContent = temp + '°C';
    widget.title = PLACE + ' — ' + labelFor(cur.weather_code) + ', ' + temp + '°C';
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
  setInterval(poll, 30 * 60 * 1000);
})();
