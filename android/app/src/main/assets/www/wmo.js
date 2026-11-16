/* WMO weather codes + warning rules (pure, testable in node) */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KHW = api;
})(this, function () {
  var CODES = {
    0: ['Ясно', '☀️', '🌙'],
    1: ['Переважно ясно', '🌤️', '🌙'],
    2: ['Мінлива хмарність', '⛅', '☁️'],
    3: ['Похмуро', '☁️', '☁️'],
    45: ['Туман', '🌫️', '🌫️'],
    48: ['Паморозь', '🌫️', '🌫️'],
    51: ['Слабка мряка', '🌦️', '🌦️'],
    53: ['Мряка', '🌦️', '🌦️'],
    55: ['Сильна мряка', '🌧️', '🌧️'],
    56: ['Крижана мряка', '🌧️', '🌧️'],
    57: ['Сильна крижана мряка', '🌧️', '🌧️'],
    61: ['Слабкий дощ', '🌦️', '🌦️'],
    63: ['Дощ', '🌧️', '🌧️'],
    65: ['Сильний дощ', '🌧️', '🌧️'],
    66: ['Крижаний дощ', '🌧️', '🌧️'],
    67: ['Сильний крижаний дощ', '🌧️', '🌧️'],
    71: ['Слабкий сніг', '🌨️', '🌨️'],
    73: ['Сніг', '🌨️', '🌨️'],
    75: ['Сильний сніг', '❄️', '❄️'],
    77: ['Снігові зерна', '🌨️', '🌨️'],
    80: ['Слабка злива', '🌦️', '🌦️'],
    81: ['Злива', '🌧️', '🌧️'],
    82: ['Сильна злива', '⛈️', '⛈️'],
    85: ['Снігова злива', '🌨️', '🌨️'],
    86: ['Сильна снігова злива', '❄️', '❄️'],
    95: ['Гроза', '⛈️', '⛈️'],
    96: ['Гроза з градом', '⛈️', '⛈️'],
    99: ['Сильна гроза з градом', '⛈️', '⛈️']
  };

  var DIRS = ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'];

  function desc(code) {
    return CODES[code] ? CODES[code][0] : '—';
  }

  function icon(code, isDay) {
    if (!CODES[code]) return '❓';
    return isDay === 0 ? CODES[code][2] : CODES[code][1];
  }

  function dirName(deg) {
    if (deg == null || isNaN(deg)) return '—';
    var i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
    return DIRS[i];
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (v === null || v === undefined || isNaN(n)) ? null : n;
  }

  function r1(v) {
    return Math.round(v * 10) / 10;
  }

  var LEVEL = { yellow: 1, orange: 2 };

  /* daily: Open-Meteo daily arrays; returns [{date,type,level,text}] */
  function warnDays(daily) {
    var out = [];
    if (!daily || !daily.time) return out;
    var n = daily.time.length;
    for (var i = 0; i < n; i++) {
      var g = num(daily.wind_gusts_10m_max && daily.wind_gusts_10m_max[i]);
      var pr = num(daily.precipitation_sum && daily.precipitation_sum[i]);
      var code = num(daily.weather_code && daily.weather_code[i]);
      var tmax = num(daily.temperature_2m_max && daily.temperature_2m_max[i]);
      var tmin = num(daily.temperature_2m_min && daily.temperature_2m_min[i]);
      var add = function (type, level, text) {
        out.push({ date: daily.time[i], type: type, level: level, text: text });
      };

      if (g != null) {
        if (g >= 25) add('wind', 'orange', 'дуже сильний вітер, пориви до ' + Math.round(g) + ' м/с');
        else if (g >= 15) add('wind', 'yellow', 'сильний вітер, пориви до ' + Math.round(g) + ' м/с');
      }
      if (pr != null) {
        if (pr >= 20) add('rain', 'orange', 'сильні опади: ' + r1(pr) + ' мм');
        else if (pr >= 10) add('rain', 'yellow', 'значні опади: ' + r1(pr) + ' мм');
      }
      if (code === 95) add('storm', 'yellow', 'гроза');
      if (code === 96 || code === 99) add('storm', 'orange', 'гроза з градом');
      if (code === 66 || code === 67) add('ice', 'orange', 'крижаний дощ, ожеледиця');
      if (code === 75 || code === 86) add('snow', 'yellow', 'сильний сніг');
      if (tmax != null && tmax >= 30) add('heat', 'yellow', 'спека до ' + Math.round(tmax) + '°');
      if (tmin != null && tmin <= -15) add('frost', 'yellow', 'сильний мороз до ' + Math.round(tmin) + '°');
    }
    return dedupe(out);
  }

  /* same date+type -> keep the strongest level */
  function dedupe(list) {
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      var k = w.date + '|' + w.type;
      if (!map[k] || LEVEL[w.level] > LEVEL[map[k].level]) map[k] = w;
    }
    var out = [];
    for (var j = 0; j < list.length; j++) {
      var w2 = list[j];
      var k2 = w2.date + '|' + w2.type;
      if (map[k2] === w2) out.push(w2);
    }
    return out;
  }

  function worstLevel(list) {
    var m = 0;
    for (var i = 0; i < list.length; i++) m = Math.max(m, LEVEL[list[i].level] || 0);
    return m === 2 ? 'orange' : (m === 1 ? 'yellow' : 'none');
  }

  return {
    CODES: CODES,
    desc: desc,
    icon: icon,
    dirName: dirName,
    warnDays: warnDays,
    worstLevel: worstLevel,
    LEVEL: LEVEL
  };
});
