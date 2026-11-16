/* Погода Харківщина — Open-Meteo, огляд по населених пунктах області */
(function () {
  'use strict';

  var API = 'https://api.open-meteo.com/v1/forecast';
  var CUR = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
    'weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  var DLY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
    'precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,' +
    'sunrise,sunset,uv_index_max';
  var HRL = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,' +
    'weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day';

  var CACHE_KEY = 'khw_cache_v1';
  var SEL_KEY = 'khw_sel_v1';

  var S = {
    places: window.KHW_PLACES || [],
    sel: [],
    active: 0,
    data: null,
    hour: null,
    hourCache: {},
    ts: 0,
    busy: false
  };

  /* ---------------- HTTP: native bridge first, fetch as fallback ---------------- */

  var seq = 0;
  var pending = {};

  window.__nativeResult = function (id, body) {
    var cb = pending[id];
    if (cb) {
      delete pending[id];
      cb(body);
    }
  };

  function nativeGet(url) {
    return new Promise(function (resolve, reject) {
      if (!window.Native || typeof window.Native.get !== 'function') {
        reject(new Error('no-native'));
        return;
      }
      var id = 'r' + (++seq);
      pending[id] = function (body) {
        if (typeof body !== 'string') {
          reject(new Error('native-bad-response'));
          return;
        }
        if (body.indexOf('ERROR:') === 0) {
          reject(new Error(body.slice(6)));
          return;
        }
        resolve(body);
      };
      try {
        window.Native.get(id, url);
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  function fetchGet(url) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, 25000);
      fetch(url, { cache: 'no-store' }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { reject(new Error('HTTP ' + r.status)); return; }
        r.text().then(resolve, reject);
      }, function (e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function getJson(url) {
    return nativeGet(url).catch(function () { return fetchGet(url); }).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('некоректна відповідь сервера');
      }
    });
  }

  /* ---------------- helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (v === null || v === undefined || isNaN(n)) ? null : n;
  }

  function fmt(v, d) {
    var n = num(v);
    return n == null ? '—' : n.toFixed(d == null ? 0 : d);
  }

  function pct(v, lo, hi) {
    var n = num(v);
    if (n == null) return 0;
    var span = hi - lo;
    if (span <= 0) return 50;
    return Math.max(0, Math.min(100, (n - lo) / span * 100));
  }

  var WD = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var MON = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

  function dObj(iso) { return new Date(iso + 'T12:00:00'); }
  function dayName(iso) { return WD[dObj(iso).getDay()]; }
  function dm(iso) {
    var d = dObj(iso);
    return d.getDate() + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function fullDate(iso) {
    var d = dObj(iso);
    return d.getDate() + ' ' + MON[d.getMonth()];
  }
  function hm(iso) { return iso ? iso.slice(11, 16) : '—'; }
  function pad2(n) { return ('0' + n).slice(-2); }

  function banner(text, kind) {
    var b = $('banner');
    if (!text) {
      b.className = 'banner hidden';
      b.textContent = '';
      return;
    }
    b.className = 'banner ' + (kind || 'warn');
    b.textContent = text;
  }

  var toastTimer = null;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.className = 'toast';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, 3500);
  }

  /* ---------------- state / selection ---------------- */

  function allIdx() {
    return S.places.map(function (_, i) { return i; });
  }

  function loadSel() {
    try {
      var s = JSON.parse(localStorage.getItem(SEL_KEY));
      if (Array.isArray(s) && s.length) {
        s = s.filter(function (i) { return i >= 0 && i < S.places.length; });
        if (s.length) return s;
      }
    } catch (e) { /* ignore */ }
    return allIdx();
  }

  function saveSel() {
    try { localStorage.setItem(SEL_KEY, JSON.stringify(S.sel)); } catch (e) { /* ignore */ }
  }

  function activePlace() {
    return S.places[S.sel[S.active]];
  }

  function activeData() {
    return S.data ? S.data[S.active] : null;
  }

  /* ---------------- data loading ---------------- */

  function overviewUrl() {
    var ps = S.sel.map(function (i) { return S.places[i]; });
    var lat = ps.map(function (p) { return p.lat; }).join(',');
    var lon = ps.map(function (p) { return p.lon; }).join(',');
    return API + '?latitude=' + lat + '&longitude=' + lon +
      '&current=' + CUR + '&daily=' + DLY +
      '&timezone=Europe%2FKyiv&forecast_days=7&wind_speed_unit=ms';
  }

  function hourUrl(p) {
    return API + '?latitude=' + p.lat + '&longitude=' + p.lon +
      '&current=temperature_2m&hourly=' + HRL +
      '&timezone=Europe%2FKyiv&forecast_days=2&wind_speed_unit=ms';
  }

  function one(res) {
    return Array.isArray(res) ? res[0] : res;
  }

  function loadOverview() {
    return getJson(overviewUrl()).then(function (res) {
      var arr = Array.isArray(res) ? res : [res];
      if (arr.length !== S.sel.length) throw new Error('очікувано ' + S.sel.length + ' точок, отримано ' + arr.length);
      S.data = arr;
      S.ts = Date.now();
      saveCache();
      renderAll();
      banner('');
    });
  }

  function loadHour() {
    var pi = S.sel[S.active];
    var p = S.places[pi];
    var cached = S.hourCache[pi];
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      S.hour = cached.data;
      renderHour();
      return Promise.resolve();
    }
    return getJson(hourUrl(p)).then(function (res) {
      S.hour = one(res);
      S.hourCache[pi] = { ts: Date.now(), data: S.hour };
      if (S.sel[S.active] === pi) renderHour();
    });
  }

  function refresh() {
    if (S.busy) return Promise.resolve();
    S.busy = true;
    var btn = $('refresh');
    btn.disabled = true;
    return Promise.all([loadOverview(), loadHour()]).catch(function (e) {
      var msg = (e && e.message) || String(e);
      banner('Немає зв\'язку з Open-Meteo (' + msg + '). Показано останні збережені дані.', 'warn');
    }).then(function () {
      S.busy = false;
      btn.disabled = false;
      updateUpdated();
    });
  }

  /* ---------------- cache ---------------- */

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ sel: S.sel, data: S.data, ts: S.ts }));
    } catch (e) { /* ignore */ }
  }

  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && Array.isArray(c.data) && c.ts && Array.isArray(c.sel) &&
          c.sel.length === S.sel.length && c.sel.every(function (v, i) { return v === S.sel[i]; })) {
        return c;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function updateUpdated() {
    if (!S.ts) {
      $('updated').textContent = '—';
      return;
    }
    var d = new Date(S.ts);
    $('updated').textContent = 'оновлено ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ---------------- rendering ---------------- */

  function renderChips() {
    var box = $('places');
    box.innerHTML = '';
    S.sel.forEach(function (pi, si) {
      var p = S.places[pi];
      var b = el('button', 'chip' + (si === S.active ? ' active' : ''), esc(p.name));
      b.onclick = function () { setActive(si); };
      box.appendChild(b);
    });
  }

  function setActive(si) {
    if (si === S.active) return;
    S.active = si;
    S.hour = null;
    renderChips();
    renderNow();
    renderDays();
    renderHour();
    updateTitles();
    loadHour().catch(function () { /* ignore */ });
  }

  function updateTitles() {
    var p = activePlace();
    if (!p) return;
    $('hour-title').textContent = p.name;
    $('days-title').textContent = p.name;
  }

  function renderNow() {
    var box = $('now');
    var d = activeData();
    var p = activePlace();
    if (!d || !p) {
      box.innerHTML = '<div class="empty">Немає даних. Натисни «Оновити».</div>';
      return;
    }
    var c = d.current || {};
    var dl = d.daily || {};
    var isDay = c.is_day !== 0;
    var arrow = '<span class="arrow" style="transform:rotate(' + ((num(c.wind_direction_10m) || 0) + 180) + 'deg)">↑</span>';

    var tiles = [
      ['Вітер', arrow + ' ' + fmt(c.wind_speed_10m, 1) + ' м/с',
        KHW.dirName(c.wind_direction_10m) + ' · пориви ' + fmt(c.wind_gusts_10m, 1)],
      ['Відчувається', fmt(c.apparent_temperature, 1) + '°', ''],
      ['Вологість', fmt(c.relative_humidity_2m) + '%', ''],
      ['Тиск', fmt(c.pressure_msl) + ' гПа', ''],
      ['Опади зараз', fmt(c.precipitation, 1) + ' мм', ''],
      ['Хмарність', fmt(c.cloud_cover) + '%', ''],
      ['Схід / захід', hm(dl.sunrise && dl.sunrise[0]) + ' / ' + hm(dl.sunset && dl.sunset[0]), ''],
      ['UV макс.', fmt(dl.uv_index_max && dl.uv_index_max[0], 1), fullDate(dl.time ? dl.time[0] : '')]
    ];

    var html = '<div class="now ' + (isDay ? 'day' : 'night') + '">' +
      '<div class="now-place">' + esc(p.name) + '<span class="muted small"> · ' + esc(p.raion || '') + ' р-н</span></div>' +
      '<div class="now-main">' +
        '<div class="now-ico">' + KHW.icon(c.weather_code, c.is_day) + '</div>' +
        '<div class="now-temp">' + fmt(c.temperature_2m) + '<span class="deg">°C</span></div>' +
      '</div>' +
      '<div class="now-desc">' + esc(KHW.desc(c.weather_code)) +
        (c.time ? '<span class="muted small"> · ' + hm(c.time) + '</span>' : '') + '</div>' +
      '<div class="tiles">';
    tiles.forEach(function (t) {
      html += '<div class="tile"><div class="t-label">' + esc(t[0]) + '</div>' +
        '<div class="t-val">' + t[1] + '</div>' +
        (t[2] ? '<div class="t-sub muted small">' + t[2] + '</div>' : '') + '</div>';
    });
    html += '</div></div>';
    box.innerHTML = html;
  }

  function renderHour() {
    var box = $('hour');
    var p = activePlace();
    var name = p ? p.name : '';
    var h = S.hour && S.hour.hourly;
    if (!h || !h.time) {
      box.innerHTML = '<div class="empty">Завантаження погодинних даних' + (name ? ' · ' + esc(name) : '') + '…</div>';
      return;
    }
    var nowStr = (S.hour.current && S.hour.current.time) ? S.hour.current.time.slice(0, 13) + ':00' : '';
    var start = 0;
    if (nowStr) {
      for (var j = 0; j < h.time.length; j++) {
        if (h.time[j] >= nowStr) { start = j; break; }
      }
    }
    box.innerHTML = '';
    var end = Math.min(h.time.length, start + 24);
    for (var i = start; i < end; i++) {
      var pp = num(h.precipitation_probability[i]);
      var gust = num(h.wind_gusts_10m[i]);
      var card = el('div', 'hour-card' + (i === start ? ' current' : ''),
        '<div class="h-time">' + (i === start ? 'зараз' : hm(h.time[i])) + '</div>' +
        '<div class="h-ico">' + KHW.icon(h.weather_code[i], h.is_day[i]) + '</div>' +
        '<div class="h-temp">' + fmt(h.temperature_2m[i]) + '°</div>' +
        '<div class="h-pp">' + (pp != null && pp > 0 ? '💧' + Math.round(pp) + '%' : '') + '</div>' +
        '<div class="h-wind">' + fmt(h.wind_speed_10m[i], 1) + '</div>' +
        (gust != null && gust >= 15 ? '<div class="h-gust">⚠' + Math.round(gust) + '</div>' : '<div class="h-gust"></div>'));
      box.appendChild(card);
    }
  }

  function renderDays() {
    var box = $('days');
    var d = activeData();
    if (!d || !d.daily || !d.daily.time) {
      box.innerHTML = '<div class="empty">Немає даних</div>';
      return;
    }
    var dl = d.daily;
    var lo = Math.min.apply(null, dl.temperature_2m_min);
    var hi = Math.max.apply(null, dl.temperature_2m_max);
    box.innerHTML = '';
    for (var i = 0; i < dl.time.length; i++) {
      var name = i === 0 ? 'Сьогодні' : (i === 1 ? 'Завтра' : dayName(dl.time[i]));
      var pr = num(dl.precipitation_sum[i]);
      var pp = num(dl.precipitation_probability_max[i]);
      var row = el('div', 'day-row',
        '<div class="d-name"><b>' + name + '</b><span class="muted small">' + dm(dl.time[i]) + '</span></div>' +
        '<div class="d-ico">' + KHW.icon(dl.weather_code[i], 1) + '</div>' +
        '<div class="d-temps">' +
          '<span class="tmin">' + fmt(dl.temperature_2m_min[i]) + '°</span>' +
          '<span class="bar"><i style="left:' + pct(dl.temperature_2m_min[i], lo, hi) + '%;right:' +
            (100 - pct(dl.temperature_2m_max[i], lo, hi)) + '%"></i></span>' +
          '<span class="tmax">' + fmt(dl.temperature_2m_max[i]) + '°</span>' +
        '</div>' +
        '<div class="d-desc">' + esc(KHW.desc(dl.weather_code[i])) + '</div>' +
        '<div class="d-rain">💧 ' + fmt(pr, 1) + ' мм' + (pp != null ? ' · ' + Math.round(pp) + '%' : '') + '</div>' +
        '<div class="d-wind">💨 ' + fmt(dl.wind_speed_10m_max[i], 1) +
          ' / ' + fmt(dl.wind_gusts_10m_max[i], 1) + ' м/с</div>');
      box.appendChild(row);
    }
  }

  function renderArea() {
    var table = $('area');
    if (!S.data || !S.data.length) {
      table.innerHTML = '';
      return;
    }
    var rows = S.sel.map(function (pi, si) { return { pi: pi, si: si, d: S.data[si] }; });
    rows.sort(function (a, b) {
      return S.places[a.pi].name.localeCompare(S.places[b.pi].name, 'uk');
    });

    var html = '<thead><tr><th>Пункт</th><th>Зараз</th><th>Сьогодні</th><th>Завтра</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var p = S.places[r.pi];
      var c = r.d.current || {};
      var dl = r.d.daily || {};
      var c0 = '<div class="cell">' + KHW.icon(c.weather_code, c.is_day) + ' <b>' + fmt(c.temperature_2m) + '°</b>' +
        '<span class="muted small"> ' + fmt(c.wind_speed_10m, 1) + ' м/с</span></div>';
      function day(i) {
        if (!dl.time || !dl.time[i]) return '<span class="muted">—</span>';
        return '<div class="cell">' + KHW.icon(dl.weather_code[i], 1) +
          ' <b>' + fmt(dl.temperature_2m_min[i]) + '…' + fmt(dl.temperature_2m_max[i]) + '°</b></div>' +
          '<div class="cell-sub muted small">💧 ' + fmt(dl.precipitation_sum[i], 1) + ' мм · 💨 ' +
          fmt(dl.wind_gusts_10m_max[i], 1) + ' м/с</div>';
      }
      html += '<tr data-si="' + r.si + '"><td class="p-name">' + esc(p.name) + '</td>' +
        '<td>' + c0 + '</td><td>' + day(0) + '</td><td>' + day(1) + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;

    Array.prototype.forEach.call(table.querySelectorAll('tr[data-si]'), function (tr) {
      tr.onclick = function () {
        switchTab('now');
        setActive(Number(tr.getAttribute('data-si')));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
  }

  function renderWarn() {
    var box = $('warn');
    var items = [];
    if (S.data) {
      S.sel.forEach(function (pi, si) {
        var d = S.data[si];
        if (!d || !d.daily) return;
        KHW.warnDays(d.daily).forEach(function (w) {
          items.push({ place: S.places[pi].name, w: w });
        });
      });
    }
    if (!items.length) {
      box.innerHTML = '<div class="empty good">Найближчі 7 днів небезпечних явищ за нашими критеріями не очікується.</div>';
      return;
    }
    items.sort(function (a, b) {
      var lv = (KHW.LEVEL[b.w.level] || 0) - (KHW.LEVEL[a.w.level] || 0);
      if (lv) return lv;
      return a.w.date < b.w.date ? -1 : (a.w.date > b.w.date ? 1 : 0);
    });

    var orange = items.filter(function (x) { return x.w.level === 'orange'; }).length;
    var places = {};
    items.forEach(function (x) { places[x.place] = 1; });
    var html = '<div class="warn-summary">' +
      '<b>' + items.length + '</b> попереджень у <b>' + Object.keys(places).length + '</b> пунктах' +
      (orange ? '<div class="badge orange">' + orange + ' помаранчевих</div>' : '') +
      '</div>';
    items.forEach(function (x) {
      var when = x.w.date === (S.data && S.data[0] && S.data[0].daily ? S.data[0].daily.time[0] : '')
        ? 'сьогодні' : (dayName(x.w.date) + ', ' + dm(x.w.date));
      html += '<div class="warn-item ' + x.w.level + '">' +
        '<div class="w-head"><span class="badge ' + x.w.level + '">' +
        (x.w.level === 'orange' ? 'помаранчевий' : 'жовтий') + '</span>' +
        '<b>' + esc(x.place) + '</b><span class="muted small"> · ' + when + '</span></div>' +
        '<div class="w-text">' + esc(x.w.text) + '</div></div>';
    });
    box.innerHTML = html;
  }

  function renderAll() {
    renderChips();
    renderNow();
    renderDays();
    renderHour();
    renderArea();
    renderWarn();
    updateTitles();
    updateUpdated();
    if (S.ts && Date.now() - S.ts > 60 * 60 * 1000) {
      banner('Дані застарілі (понад годину). Перевір інтернет і натисни «Оновити».', 'info');
    }
  }

  /* ---------------- tabs / modal ---------------- */

  function switchTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (s) {
      s.classList.toggle('hidden', s.id !== 'tab-' + name);
    });
    if (name === 'hour' && !S.hour) loadHour().catch(function () { /* ignore */ });
  }

  function openModal() {
    var list = $('modal-list');
    list.innerHTML = '';
    S.places.forEach(function (p, i) {
      var on = S.sel.indexOf(i) !== -1;
      var row = el('label', 'modal-row',
        '<input type="checkbox" ' + (on ? 'checked' : '') + ' data-i="' + i + '">' +
        '<span>' + esc(p.name) + '</span><span class="muted small">' + esc(p.raion || '') + ' р-н</span>');
      list.appendChild(row);
    });
    $('modal').classList.remove('hidden');
  }

  function modalSetAll(v) {
    Array.prototype.forEach.call($('modal-list').querySelectorAll('input[type=checkbox]'), function (c) {
      c.checked = v;
    });
  }

  function applySelection() {
    var picked = [];
    Array.prototype.forEach.call($('modal-list').querySelectorAll('input[type=checkbox]'), function (c) {
      if (c.checked) picked.push(Number(c.getAttribute('data-i')));
    });
    if (!picked.length) {
      toast('Обери хоча б один пункт');
      return;
    }
    picked.sort(function (a, b) { return a - b; });
    S.sel = picked;
    S.active = 0;
    S.hour = null;
    S.hourCache = {};
    S.data = null;
    saveSel();
    $('modal').classList.add('hidden');
    renderAll();
    refresh();
  }

  /* ---------------- init ---------------- */

  function init() {
    if (!S.places.length) {
      $('now').innerHTML = '<div class="empty">Не знайдено список пунктів (places.js)</div>';
      return;
    }
    S.sel = loadSel();
    renderChips();
    updateTitles();

    var cache = readCache();
    if (cache) {
      S.data = cache.data;
      S.ts = cache.ts;
      renderAll();
    } else {
      $('now').innerHTML = '<div class="empty">Завантаження прогнозу…</div>';
    }

    $('refresh').onclick = function () { refresh(); };
    $('pick').onclick = openModal;
    $('modal-all').onclick = function () { modalSetAll(true); };
    $('modal-none').onclick = function () { modalSetAll(false); };
    $('modal-ok').onclick = applySelection;
    $('modal').onclick = function (e) {
      if (e.target === $('modal')) $('modal').classList.add('hidden');
    };

    Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
      b.onclick = function () { switchTab(b.getAttribute('data-tab')); };
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });
    setInterval(function () {
      if (!document.hidden && Date.now() - S.ts > 10 * 60 * 1000) refresh();
    }, 60000);

    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
