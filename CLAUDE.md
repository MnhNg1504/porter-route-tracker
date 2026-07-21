# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**Porter — Cung leo Việt Nam** ("Vietnam climbing routes") is a mobile-first
**Progressive Web App** for logging trekking journeys on Vietnamese mountain
and cave routes. It records real GPS tracks, renders routes as a stylized 3D
diagram and on a real Leaflet map, awards badges for summited peaks, and wraps
everything in a fake-iPhone social-feed UI. The whole thing runs client-side —
there is **no backend, no build step, and no package manager**.

The codebase is written **entirely in Vietnamese** — identifiers, comments, and
UI strings. Preserve this convention: name new functions/variables in Vietnamese
to match the surrounding code (see the glossary below). UI copy is Vietnamese.

## Repository layout

```
index.html      v1 app ("MountainTracker") — legacy, ~2,300 lines, self-contained
v2.html         v2 app ("Porter") — CURRENT, ~4,900 lines, self-contained. Work here.
sw.js           Service worker: offline shell cache + offline map-tile cache
manifest.json   PWA manifest (name, icons, standalone display, portrait, lang=vi)
lib/            Vendored Leaflet 1.9.4 (leaflet.js + leaflet.css) — used by v2
icons/          PWA icons (icon-192.png, icon-512.png)
photos/         Feed/splash photos; photos/cung/ has one cover image per route
```

There is **no `assets/` directory in the repo**, but `v2.html` references
`assets/Young*.otf` (fonts) and `assets/mark-*.png` (share-card logos). These
load-fail gracefully — fonts fall back to Archivo (Google Fonts) then system
fonts; the mark images render broken. If share cards or the custom display font
matter for a task, this missing folder is the likely cause.

### `index.html` vs `v2.html`

They are two independent single-file apps sharing the same look and route data,
not a shared codebase. **`v2.html` is the current app — make changes there** and
only touch `index.html` when a task explicitly targets the legacy version.

| | `index.html` (v1) | `v2.html` (v2 — current) |
|---|---|---|
| Global API | `window.MountainTracker` | `window.MountainTracker` |
| Leaflet source | unpkg CDN | vendored `lib/leaflet.js` |
| Service worker | **not registered** | registered (`sw.js`) |
| Extra pages | route + feed | + community feed, challenges, badges, profile |
| Route library | 5 hand-authored routes | 5 authored + ~16 GPX-tracked routes |
| Home page | community feed | overview (suggestions + friends) |

`sw.js` precaches both `index.html` and `v2.html` plus the photos and Leaflet.

## Architecture (v2.html)

One HTML file, three sections in order: `<style>` (design tokens + all CSS),
markup (the fake-iPhone `.device` shell containing five `.page` sections and a
bottom `.tabbar`), then a single IIFE `<script>` (`(function(){ 'use strict'; … })()`)
holding all logic. Everything is plain DOM + vanilla JS — no framework, no modules.

**Pages** are `<section class="page" data-page="…">`; exactly one carries
`.active`. Navigation is `moTrang('home'|'lotrinh'|'route'|'thuthach'|'hoso')`,
which toggles `.active` and calls that page's render function. The five pages:
`home` (feed/overview), `lotrinh` (route list), `route` (3D diagram + real map +
GPS recorder), `thuthach` (challenges), `hoso` (profile).

**Route view** has two sub-views toggled by `setSwap('scene'|'gps')`:
`scene` = the stylized 3D contour diagram (SVG, camera orbit with yaw/pitch,
inertia, 1–4× zoom); `gps` = the real Leaflet map. `syncView()` picks the
default per route (mountain routes → diagram, "self-guided"/urban → map).

### Route data model

Routes live in the `CUNG` object (Vietnamese *cung* = route/leg), keyed by id.
`THU_TU` is the ordered id list (`['fansipan','samu','laothan','tulan','sondoong','custom']`);
`custom` is the user's free-form "self-guided" route and stays last. Each route:

```js
fansipan: {
  id, ten /*name*/, viTri /*location*/, loai:'nui'|'hang' /*mountain|cave*/,
  gps:{lat,lon}, gpsApprox, tuyenThat /*real track vs illustrative*/,
  dinh /*summit m*/, km, leo /*ascent m*/, doKho /*difficulty*/, thoiGian, mua /*season*/,
  diaHinh:{cao,rong,vai},        // terrain params for the 3D field y = cao·exp(-d²/rong)
  trail:[pinId,…],               // ordered waypoint ids forming the route line
  pins:[{id,x,z,kind,tt,mt,…}],  // map/diagram markers; kind: letter|tent|signal|flag|hand
  log:[{kind:'start'|'camp'|'summit', ten, luc, fields:[…]}]  // journal timeline
}
```

Additional route data, all applied at startup:
- **`GPX_EMBED`** — real recorded tracks (`[[lat,lon,ele],…]`) for ~16 routes,
  behind a `/*__GPX_EMBED__*/` marker (an external tool injects the JSON here;
  keep the marker intact). `napGPXEmbed()` turns each into a route via
  `themCung(...)` + `napTrack(...)` + `autoPins(...)`.
- **`GPX_META`** — display name/location/duration for GPX-only routes.
- **`CHUAN`** — "standard" enrichment (official km/summit/difficulty, camps `lan`,
  scenic points `dep`, water `nuoc`, permits `phep`), merged by `apDungChuan()`.

### GPS journey recording

`startJourney()` → `navigator.geolocation.watchPosition` → points pushed to
`recPts` → `stopJourney()` → `tongKetHanhTrinh()` shows the summary + awards a
badge. Key pieces: `liveTrack`/`recDist`/`haversine` (distance), Wake Lock via
`giuManHinh`/`nhaManHinh` (keep screen on), turn-by-turn guidance
(`diemReTuDong`, `buildStops`, `navUpdate`), and a **30-second autosave** to
`localStorage['mt-recbk']` so a crash mid-record can be recovered on next load.
`journeyMode` is `'mau'` (follow a route) | `'tao'` (create/free) | `'luyen'` (training).

### Persistence (localStorage — no backend)

| Key | Contents |
|---|---|
| `mt-track` | last saved custom GPS track |
| `mt-recbk` | 30s autosave of an in-progress recording (crash recovery) |
| `mt-khuvuc` | selected area/region filter |
| `mt-huyhieu` | earned badges `{routeId: dateISO}` |
| `mt-tongke` | lifetime totals `{km, leo, chuyen, giay}` |
| theme + per-route keys | via `layJSON(k,default)` / `luuJSON(k,v)` helpers |

Badges unlock automatically when a recorded track passes within **1 km** of a
route's summit coords (`xetHuyHieu`), or manually via the "đã chinh phục" button.

### Public API

Both apps expose `window.MountainTracker` for console/programmatic use:
`napTrack, napGPX, napKML, ganAnh, themCung, chonCung, moTrang, moNhatKy,
moAdmin, dsDiem, dsCung(), cungHienTai()`, plus a `demoHoanThanh(id)` /
`demoHoanThanh` helper that fakes a completed journey.

### Maps & offline

Real map is Leaflet with CARTO/OSM tiles. `sw.js` runs two caches:
`porter-v3` (app shell — bump this version string to force-refresh the shell)
and `porter-tiles-v1` (offline map tiles). Tile URLs are canonicalized
(subdomain → `a`, drop `@2x`) before cache lookup so packed tiles serve offline.
`taiGoiTile`/`xoaGoiTile` download/clear a route's tile pack.

## Conventions

- **Language**: Vietnamese throughout — match it in new code and UI strings.
- **No build/deps**: don't add a bundler, `package.json`, or npm packages.
  Everything ships as static files opened directly by the browser. New vendored
  libs go in `lib/` and are referenced by relative path.
- **Self-contained files**: keep each app's CSS and JS inline in its HTML file;
  don't split `v2.html` into external modules.
- **Design tokens**: colors/radius are CSS variables on `:root` (`--ground`,
  `--ink`, `--go` accent, `--signal`, `--radius`, …). Reuse them; the UI is a
  dark OLED theme framed as an iPhone.
- **Relative paths only** (`./`, `lib/…`, `photos/…`) so the PWA works under any
  scope and offline.
- **When adding a route**: add to `CUNG` + `THU_TU`, or provide a track in
  `GPX_EMBED` (+ `GPX_META`) and let `napGPXEmbed()` register it. Add its cover
  image to `photos/cung/<id>.jpg`.
- **When changing shell assets**: update the `SHELL` list and bump `CACHE` in
  `sw.js`, otherwise clients keep serving the stale cached version.

## Running & testing

No test suite, no linter, no CI. To run, serve the directory over HTTP (the
service worker and geolocation need a secure/localhost origin — `file://` won't
register the SW), e.g.:

```bash
python3 -m http.server 8000    # then open http://localhost:8000/v2.html
```

Verify changes manually in a mobile-viewport browser: page navigation via the
tabbar, the route diagram ↔ map swap, and (with location permission) starting a
journey. There is nothing to build — edits to the HTML are live on reload.

## Glossary (Vietnamese → English)

Domain terms you'll meet constantly in identifiers and comments:

| Term | Meaning | Term | Meaning |
|---|---|---|---|
| cung | route / trek leg | tuyến | route line / track |
| đỉnh (dinh) | summit | leo | ascent / climb |
| núi (nui) | mountain | hang | cave |
| hành trình | journey | ghi / ghi hình | record |
| nhật ký (nhatky) | journal / log | huy hiệu / huy chương | badge / medal |
| trại (trai) | camp | lán (lan) | mountain hut / shelter |
| sơ đồ | diagram | bản đồ | map |
| bắt đầu / dừng | start / stop | vệt / vết | track (GPS trace) |
| khu vực | area / region | thử thách | challenge |
| hồ sơ | profile | bài viết | post (feed) |
| bình luận | comment | dẫn đường | navigation / guidance |
| địa hình | terrain | ướm / uốm | project/snap onto route |
| chinh phục | conquer (summit) | mở / đóng | open / close |
| nạp | load / ingest | tổng kết | summary / wrap-up |
| tự đi / tự do | self-guided / free | mẫu | sample / template |
```
