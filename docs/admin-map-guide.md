# Administrator: kom i gang med ledningskortet

Den detaljerede trin-for-trin-vejledning til oprettelse og kobling af adresser, ledninger, haner og lukkeområder findes i [`network-data-guide.md`](network-data-guide.md). Denne side beskriver den tekniske opsætning og den korte arbejdsgang.

Nye QGIS-brugere kan åbne den visuelle HTML-vejledning [`qgis-begyndervejledning.html`](qgis-begyndervejledning.html) direkte i en browser.

## Hvad kan laves hvor?

Websiden på `http://localhost:8080/kort` bruges i fase 2 til at se, søge og kontrollere kortdata. Oprettelse og redigering af adresser, haner, ledninger og lukkeområder foretages i QGIS. Ændringer gemmes direkte i PostGIS og bliver synlige på webkortet efter genindlæsning.

De fem adresser, fire haner, fire ledninger og to lukkeområder, der følger med udviklingsmiljøet, er syntetiske eksempler. De må ikke betragtes som faktiske ledningsoplysninger.

## 1. Kontrollér systemet

Start udviklingsmiljøet fra projektets rodmappe:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up --build -d
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml ps
```

Alle tre services skal være `healthy`. Log ind på `http://localhost:8080`, åbn **Ledningskort**, og kontrollér at OSM-baggrundskortet og de syntetiske objekter vises.

## 2. Installér QGIS

Installér en aktuel QGIS Long Term Release fra [qgis.org](https://qgis.org/). QGIS skal kunne nå databasen via localhost i udvikling eller via godkendt LAN/VPN i produktion. Databasen må aldrig åbnes mod internettet.

## 3. Opret en særskilt QGIS-bruger

Kør fra projektets rodmappe:

```bash
./scripts/create_qgis_user.sh
```

Scriptet opretter rollen `qgis_editor`, tildeler mindst mulige GIS-rettigheder og beder interaktivt om en unik adgangskode. Adgangskoden gemmes ikke i projektet.

## 4. Opret PostgreSQL-forbindelsen i QGIS

1. Åbn **Browser** i QGIS.
2. Højreklik **PostgreSQL** og vælg **Ny forbindelse**.
3. Angiv navn: `GAVADR udvikling`.
4. Angiv vært: `127.0.0.1`.
5. Angiv port: `5432`.
6. Angiv database: `gavadr`.
7. Angiv bruger: `qgis_editor` og den valgte adgangskode.
8. Aktivér kun lag i schemaet `public` og test forbindelsen.

I produktion erstattes vært og netværksadgang med vandværkets interne LAN/VPN-konfiguration. Brug aldrig Cloudflare Tunnel til PostgreSQL.

## 5. Tilføj lagene

Til visning bruges disse read-only-views:

- `qgis_active_pipes`
- `qgis_active_valves`
- `qgis_incidents`
- `qgis_map_corrections`

Til redigering tilføjes tabellerne:

- `addresses`, punktgeometri
- `valves`, punktgeometri
- `pipes`, linjegeometri
- `closure_areas`, multipolygongeometri

Alle lag skal identificeres som **ETRS89 / UTM zone 32N, EPSG:25832**. Tilføj eventuelt OpenStreetMap fra QGIS' XYZ Tiles som visuelt baggrundslag, men brug ikke OSM som dokumentation for præcis ledningsplacering.

## 6. Opret kortobjekter

Slå redigering til på ét tabel-lag ad gangen, tegn objektet, udfyld de obligatoriske felter, og gem redigeringerne.

### Adresse

Se [`address-import-guide.md`](address-import-guide.md) for manuel oprettelse, CSV-/GIS-import, datakontrol og kobling til lukkeområder.

- `street_name`: vejnavn
- `house_number`: husnummer inklusive eventuelt bogstav
- `postal_code`: præcis fire cifre
- `city`: bynavn
- `external_address_id`: ekstern nøgle, hvis den findes
- `active`: `true`

### Hane

- `code`: unikt og stabilt hane-ID
- `valve_type`: eksempelvis `gate`, `section` eller `main_stop`
- `normal_position`: `open`, `closed` eller `unknown`
- `current_position`: `open`, `closed` eller `unknown`
- `status`: eksempelvis `operational` eller `inspection_due`

### Ledning

- `code`: unikt og stabilt lednings-ID
- `pipe_type`: brug `distribution` til hoved-/fordelingsledning og `service` til stikledning
- `material`: eksempelvis `PE`, `PVC` eller `cast_iron`
- `diameter_mm`: positiv diameter i millimeter
- `installation_year`: firecifret årstal, hvis kendt
- `status`: normalt `in_service`
- `active`: `true`
- `risk_probability` og `risk_consequence`: værdier fra 1 til 5, hvis vurderet

### Lukkeområde

- `name`: unikt områdenavn
- `description`: kort driftsmæssig forklaring
- `confidence`: værdi fra 0 til 1
- `active`: `true`

Lukkeområder skal være `MULTIPOLYGON`. Hvis QGIS tegner en almindelig polygon, bruges værktøjet **Multipart to singleparts/singleparts to multipart** eller geometriens multipart-konvertering før lagring.

Tegn som udgangspunkt ikke-overlappende basisområder. En upstream-hane, der påvirker flere områder, registreres som et scenarie på hvert område; der tegnes ikke et ekstra samlepolygon. Ringområder registreres med et scenarie, der kræver alle relevante haner.

## 7. Kobl scenarier og adresser til lukkeområder

Scenarierne ligger i `closure_scenarios`, områderne i `closure_scenario_areas`, hanerne i `closure_scenario_valves`, og adresserne i `closure_area_addresses`. Ét scenarie kan påvirke flere områder, og alle dets haner skal lukkes samtidig. Scenarietabeller redigeres kun gennem websystemet. De tidligere scenarietabeller og `closure_area_valves` er kun legacy-data.

Den anbefalede arbejdsgang er at åbne **Lukkescenarier** på `/lukkescenarier`. Klik et område for at se alle scenarier, der påvirker det. Vælg eller opret derefter scenariet, og redigér dets samlede liste over områder og nødvendige haner. Alle haner i samme scenarie kræves samtidig; alternative afspærringer er separate scenarier. Funktionen er tilgængelig for administratorer og kortansvarlige og registrerer ændringen i auditloggen. Adresser redigeres fortsat fra lukkeområdets **Rediger koblinger** på Ledningskortet.

## 8. Kontrollér i webkortet

1. Gem alle QGIS-redigeringer.
2. Genindlæs `http://localhost:8080/kort`.
3. Slå lagene til og fra.
4. Søg efter det nye hane-ID, lednings-ID eller vejnavn.
5. Klik objektet og kontrollér egenskaberne.

Hvis objektet ikke vises, kontrollér at det ikke har `deleted_at`, at `active` er `true`, og at geometrien er gyldig EPSG:25832.

## 9. Sikker arbejdsgang

1. Kør `./scripts/backup.sh` før større import eller masseændringer.
2. Importér først få objekter og kontrollér dem i webkortet.
3. Brug unikke objektkoder og behold dem ved senere rettelser.
4. Slet ikke rækker fysisk. Sæt `deleted_at`, når et objekt skal udgå.
5. Registrér datakilde og datakvalitet i `source`, `quality` og `notes`.

Direkte QGIS-redigering opdaterer automatisk `updated_at`. Et fuldt revisionsspor med brugerens gamle og nye geometri er endnu ikke implementeret for QGIS-redigering; webapplikationens almindelige revisionslog dækker derfor ikke disse ændringer i fase 2.

## Fejlfinding

### Hvidt eller manglende baggrundskort

- Genbyg frontend med udviklingskommandoen fra trin 1. MapLibre-worker-filen skal være en `.mjs`-fil under `/assets/`, ikke HTML.
- Kontrollér at Nginx-proxyen kan hente `https://tile.openstreetmap.de/`, og at browseren kan hente `/tiles/` fra applikationens eget hostname.
- Deaktivér midlertidigt indholdsblokering for localhost.
- Kontrollér at WebGL er aktiveret i browseren.

### Kortet vises, men grunddata mangler

- Kontrollér at du er logget ind.
- Åbn `http://localhost:8080/api/health`.
- Kontrollér backendloggen med `docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml logs backend`.
- Kontrollér at migrationen er `20260811_0013` i tabellen `alembic_version`.

### QGIS kan ikke forbinde

- Udviklingsmiljøet skal være startet med både `docker-compose.yml` og `docker-compose.dev.yml`.
- Kontrollér at port `5432` ikke bruges af en anden lokal PostgreSQL-installation.
- Kør `./scripts/create_qgis_user.sh` igen for at nulstille brugerens adgangskode og grants.
