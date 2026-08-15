# API

FastAPI genererer OpenAPI på `/openapi.json` og interaktiv dokumentation på `/docs`.

## Fase 1-4

- Fase 1: `/api/health`, `/api/auth/*` og `/api/users*`.
- Fase 2: `/api/addresses`, `/api/valves`, `/api/pipes`, `/api/closure-areas` og `/api/map/search` som GeoJSON i EPSG:4326.

Hane-features fra `GET /api/valves` indeholder både den fysiske `valve_type` og det valgfrie `network_level`: `main`, `distribution` eller `service`. En tom værdi betyder, at hanen endnu ikke er fagligt kategoriseret i QGIS.
- Fase 3: `/api/incidents*`, opdateringer og validerede vedhæftninger.
- Fase 4: `/api/planned-shutdowns*`, haner, beregning, adresser, informationsstatus og CSV.

## Fase 5

- `/api/inquiries*`, `/updates`, validerede bilag og `/geojson`.
- `/api/map-corrections*`, `/transitions`, validerede bilag og `/geojson`.
- `/api/suppliers*` og `/api/suppliers/options`.
- `/api/tasks*` og `/comments`.

## Fase 6-7

- `GET /api/public/driftsstatus` er anonymt, CORS-læsbart og indeholder kun godkendte offentlige felter.
- `/api/public-status/{incident|shutdown}/{id}` håndterer kladde og godkendelse med rollekrav. Afslutning og tilbagetrækning gælder hændelser; vandlukninger udløber automatisk eller aflyses før start.
- `GET /public/driftsstatus.json` proxier samme dynamiske og tidsfiltrerede feed som `GET /api/public/driftsstatus`.
- `GET /healthz` tester Nginx; `GET /api/health` tester backend, database, migration og uploadfilsystem.

Interne endpoints accepterer den `HttpOnly`, `Secure`, `SameSite=Strict` sessionscookie. Login returnerer også `access_token` til eksisterende scripts og API-klienter, og bearer-auth understøttes fortsat. Browserkode skal bruge cookie og må ikke gemme tokenet i `localStorage` eller `sessionStorage`. Denne kompatibilitetsadgang bør genovervejes ved en versioneret API-ændring.

Uploads er begrænset til 10 MiB ved både Nginx og backend. Download-svar går gennem `nosniff`; klienter skal respektere serverens MIME-type og `Content-Disposition`.

## Lukkescenarier

`GET /api/closure-areas` indeholder `closure_scenarios` på hvert GeoJSON-feature. Hvert scenarie har `id`, `name`, `area_ids`, `valve_ids` og `updated_at`. Det flade `valve_ids` er unionen af områdets aktive scenarier og bruges kun til visning og søgning.

`GET` og `PUT /api/closure-areas/{id}/relations` er begrænset til administratorer og kortansvarlige. `PUT` ændrer kun `address_ids`; scenarierne i GET-svaret er read-only.

`GET`, `POST`, `PUT` og `DELETE /api/closure-scenarios` administrerer globale scenarier for administratorer og kortansvarlige. Et scenarie har mindst ét unikt `area_id` og ét unikt `valve_id`. `PUT` sender `expected_updated_at`; en forældet version afvises med `409`. Ved vandlukningsberegning skal hele scenariets `valve_ids` være valgt, hvorefter alle aktive `area_ids` medtages.
