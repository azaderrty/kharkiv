# Kharkiv — прогноз погоди Харківської області

Застосунок прогнозу погоди для Харківської області: 20 населених пунктів
(Харків + райцентри + ключові міста), поточна погода, погодинно на 24 год,
7 днів, таблиця по області та попередження за локальними правилами.

- Пакет: `com.xsiloflex.kharkiv`, версія 1.0.0, minSdk 26 / target 34.
- Стек: нативний Java-каркас (`WebView` + `assets/www`), без Capacitor/npm.
- Дані: **Open-Meteo** (`/v1/forecast`), безкоштовно, без ключа,
  `timezone=Europe/Kyiv`, `wind_speed_unit=ms`, огляд — одним запитом на всі точки.
- HTTP іде через нативний міст `Native.get(id, url)` (`HttpURLConnection`) →
  жодних проблем CORS для `file://`; у JS є fallback на `fetch`.

## Структура
```
www/                     # джерело веб-частини (єдине місце редагування)
  index.html, styles.css
  wmo.js                 # WMO-коди + правила попереджень (чисті, тестуються)
  app.js                 # стан, запити, рендер, кеш (localStorage)
  places.js              # генерується з data/places.json
  data/places.json       # список пунктів (name, lat, lon, raion)
android/                 # Gradle-проєкт (скелет від sysadmin)
  app/src/main/assets/www   # КОПІЯ www/ (створюється build.sh)
build.sh                 # синхронізує www → assets і збирає debug APK
signing/kharkiv.keystore  # alias kharkiv, пароль android
```

## Збірка (локальна, перевірена)
```sh
cd /public/kharkiv && ./build.sh
# всередині:
#   cp -r www android/app/src/main/assets/www
#   ./gradlew assembleDebug --no-daemon \
#     -Pandroid.aapt2FromMavenOverride=/tmp/androidsdk/build-tools/34.0.0/aapt2 \
#     -Dorg.gradle.native=false -Dorg.gradle.vfs.watch=false
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`
Доставка: `/sdcard/Download/dxdx/kharkiv-1.0.0-debug.apk` (+ `SHA256SUMS.txt`).

## Тести
- `node --check www/*.js`
- `node -e "…"` для `wmo.js` (мапінг кодів, `warnDays`, `worstLevel`).
- jsdom-тест (поза репо, `/tmp/khwtest/test.js`): піднімає `www/` на
  `127.0.0.1:8123`, рендерить сторінку з реальним API, перевіряє 20 чипів,
  7 днів, 20 рядків таблиці, таби, модалку, кеш, відсутність помилок.

## Правила попереджень (`wmo.js`)
Пориви ≥15 (жовтий) / ≥25 м/с (помаранчевий); опади ≥10 / ≥20 мм;
грози 95, 96/99; крижаний дощ 66/67; сильний сніг 75/86; спека ≥30 °C;
мороз ≤−15 °C. Дублікати «дата+тип» зводяться до найсильнішого рівня.

## Відомі обмеження
- Прогноз **модельний** (Open-Meteo), не офіційні дані УкрГідрометцентру.
- Немає карти, сповіщень, віджетів; оновлення — при відкритті/поверненні
  в застосунок, кожні 10 хв і кнопкою «Оновити».
- Без інтернету показується кеш (localStorage) з позначкою «застарілі дані».

## Наступні кроки (ідеї)
- Офіційні попередження (УкрГМЦ) — публічного API немає, можливий парсинг.
- Віджет на робочий стіл / щоденне сповіщення (AlarmManager + Notification).
- Карта області (Leaflet) з шаром температури/опадів.
- Збільшити список до всіх громад; вибір пунктів за замовчуванням.
