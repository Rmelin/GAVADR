# Teknisk arkitektur – Drift af vandværkets ledningsnet

## 1. Arkitekturmål

Løsningen skal være:

- selvhostet
- containerbaseret
- sikker
- let at vedligeholde
- egnet til cirka 10 samtidige brugere
- mulig at redigere via både webapplikation og QGIS
- forberedt til eksterne kort- og datatjenester
- forberedt til senere automatisk netværksanalyse

## 2. Foreslået teknologistak

### Backend

- Python
- FastAPI
- SQLAlchemy 2
- Alembic
- Pydantic
- PostgreSQL-driver med async-understøttelse

### Frontend

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- MapLibre GL JS
- moderne komponentbibliotek
- responsivt design
- dark mode som standard

### Database

- PostgreSQL
- PostGIS

### Kort

- MapLibre GL JS
- OpenStreetMap som standardbaggrund
- GeoJSON eller vector tiles fra backend
- understøttelse af WMS, WMTS og XYZ senere

### Drift

- Docker
- Docker Compose
- Cloudflare Tunnel
- NAS
- `.env` til hemmeligheder
- persistent storage til database og filer

## 3. Overordnet arkitektur

```text
Bruger
  |
HTTPS
  |
Cloudflare Tunnel
  |
Frontend / Webserver
  |
FastAPI
  |
PostgreSQL + PostGIS
  |
QGIS via intern forbindelse
```

PostgreSQL må ikke eksponeres offentligt.

QGIS-adgang skal ske via:

- lokalt netværk
- VPN
- eller anden godkendt intern adgang

## 4. Docker-services

Følgende services anbefales:

```yaml
services:
  frontend:
  backend:
  db:
  worker:
  cloudflared:
  backup:
```

### frontend

Ansvar:

- servere webapplikationen
- håndtere client-side routing
- sende API-kald til backend

### backend

Ansvar:

- REST API
- login og roller
- forretningslogik
- GIS-queries
- offentlig driftsstatus
- revisionslog
- filupload
- notifikationer

### db

Ansvar:

- PostgreSQL
- PostGIS
- persistent data
- GIS-tabeller og views

### worker

Valgfri i første fase.

Ansvar senere:

- e-mail
- planlagte notifikationer
- eksport
- generering af JSON
- oprydning
- påmindelser

### cloudflared

Ansvar:

- sikker tunnel fra internettet
- ingen åbne porte direkte til NAS'en

### backup

Ansvar:

- dagligt database-dump
- backup af filer
- rotationspolitik

## 5. Foreslået projektstruktur

```text
water-network-app/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── notifications/
│   │   ├── gis/
│   │   └── tests/
│   ├── alembic/
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   ├── layouts/
│   │   ├── map/
│   │   ├── pages/
│   │   └── types/
│   ├── Dockerfile
│   └── package.json
├── database/
│   ├── init/
│   ├── views/
│   └── seed/
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   └── create_admin.sh
├── docs/
│   ├── deployment.md
│   ├── qgis.md
│   ├── backup-restore.md
│   └── api.md
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── krav.md
├── architecture.md
└── README.md
```

## 6. Datamodel

Minimumsentiteter:

```text
User
Role
Address
Contact
Pipe
Valve
NetworkNode
ClosureArea
ClosureAreaAddress
Incident
IncidentValve
IncidentAddress
IncidentUpdate
PlannedShutdown
ResidentInquiry
MapCorrection
Task
Attachment
Notification
PublicStatus
AuditLog
Supplier
Contractor
```

Alle tabeller skal have:

- UUID som primærnøgle
- `created_at`
- `updated_at`
- eventuel `deleted_at`
- brugerreference ved relevante ændringer

## 7. GIS-datamodel

### pipe

Forslag til felter:

- id
- code
- geometry
- pipe_type
- material
- diameter_mm
- installation_year
- status
- active
- condition
- risk_probability
- risk_consequence
- source
- quality
- notes

Geometri:

```text
LINESTRING
```

### valve

Forslag til felter:

- id
- code
- geometry
- valve_type
- network_level
- normal_position
- current_position
- status
- last_operated_at
- last_inspected_at
- accessibility
- source
- quality
- notes

Geometri:

```text
POINT
```

### address

Forslag til felter:

- id
- external_address_id
- street_name
- house_number
- postal_code
- city
- geometry
- active
- notes

Geometri:

```text
POINT
```

### closure_area

Forslag til felter:

- id
- name
- geometry
- description
- confidence
- active

Geometri:

```text
POLYGON eller MULTIPOLYGON
```

### relationer

- ventiler kobles til lukkeområder
- lukkeområder kobles til adresser
- hændelser kobles til ventiler
- hændelser kobles til berørte adresser
- kortrettelser kobles til GIS-objekter

## 8. Koordinatsystem

Den interne lagring skal dokumenteres tydeligt.

Anbefaling:

- lagring i ETRS89 / UTM zone 32N, EPSG:25832
- visning i webkort via EPSG:3857
- transformation udføres i backend eller database

QGIS skal arbejde direkte med EPSG:25832.

## 9. QGIS-integration

Der skal oprettes en separat databasebruger til QGIS.

Eksempel:

```text
qgis_editor
```

Brugeren skal kun have adgang til relevante GIS-tabeller.

Der skal oprettes:

- redigerbare tabeller
- read-only views
- constraints
- enum- eller lookup-tabeller
- databasekommentarer
- dokumentation af felter

QGIS-brugeren må ikke være databaseejer.

Forslag til views:

```text
qgis_active_valves
qgis_active_pipes
qgis_open_map_corrections
qgis_incidents
```

Konflikter mellem QGIS og web håndteres i MVP'en med:

- `updated_at`
- `updated_by`
- optimistic locking, hvor det er relevant
- revisionslog

## 10. Korttjenester

Standard:

- OpenStreetMap

Systemet skal forberedes til:

- Dataforsyningen
- Datafordeleren
- SDFI
- GeoDanmark
- ortofoto
- matrikeldata
- adressedata
- bygningsdata

Konfiguration skal ske via miljøvariabler.

Eksempel:

```env
MAP_BASE_URL=
DATAFORSYNING_API_KEY=
DATAFORDELER_USERNAME=
DATAFORDELER_PASSWORD=
ORTHOPHOTO_WMTS_URL=
MATRICULAR_WMS_URL=
```

API-nøgler må ikke sendes direkte til browseren, hvis tjenesten kræver hemmelig adgang.

Backend skal kunne fungere som proxy ved behov.

## 11. API-design

Forslag til endpoints:

```text
/api/auth
/api/users
/api/addresses
/api/valves
/api/pipes
/api/closure-areas
/api/incidents
/api/planned-shutdowns
/api/inquiries
/api/map-corrections
/api/tasks
/api/notifications
/api/public/driftsstatus
/api/health
```

Interne endpoints kræver login.

Offentlige endpoints skal være read-only og begrænsede.

OpenAPI-dokumentation skal være tilgængelig.

## 12. Autentifikation og roller

MVP:

- e-mail og adgangskode
- sikker password hashing
- HTTP-only cookies eller sikre tokens
- rollebaseret adgang
- rate limiting på login
- sessionsudløb
- deaktivering af brugere

Senere:

- Cloudflare Access
- to-faktor-login
- Microsoft-login
- Google-login

## 13. Filer og billeder

Filer skal gemmes i persistent storage.

Databasen gemmer:

- filnavn
- MIME-type
- størrelse
- sti
- checksum
- relateret objekt
- uploader
- tidspunkt

Filer skal valideres.

Tilladte typer i MVP:

- JPEG
- PNG
- PDF

Der skal være maksimal filstørrelse.

## 14. Notifikationer

MVP:

- SMTP-baseret e-mail
- notifikation ved kritisk hændelse
- link til hændelsen
- logning af succes eller fejl

Konfiguration:

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
```

Senere:

- push
- SMS
- Teams
- webhook
- Signal-lignende integration

## 15. Offentlig driftsstatus

Backend skal levere:

```http
GET /api/public/driftsstatus
```

Muligt svar:

```json
{
  "updated_at": "2026-08-07T14:30:00Z",
  "status": "driftsforstyrrelse",
  "items": [
    {
      "id": "incident-123",
      "title": "Midlertidig lukning af vandet",
      "message": "Der er lukket for vandet i et afgrænset område.",
      "start_at": "2026-08-07T14:00:00Z",
      "expected_end_at": "2026-08-07T18:00:00Z",
      "severity": "high",
      "areas": ["Gadeledsvej", "Bøgekrogen"],
      "updated_at": "2026-08-07T14:30:00Z"
    }
  ]
}
```

Backend skal også kunne generere:

```text
public/driftsstatus.json
```

Publicering kræver aktiv godkendelse.

## 16. Netværksanalyse

### MVP

MVP'en bruger:

- foruddefinerede lukkeområder
- globale navngivne lukkescenarier, hvor alle haner i et scenarie kræves
- mange-til-mange-relation mellem scenarie og berørte lukkeområder
- alternative globale scenarier til upstream- og ringafspærring
- relation mellem lukkeområde og adresse
- manuel korrektion

### Senere løsning

Arkitekturen skal kunne udvides med:

- grafmodel af ledningsnettet
- noder og kanter
- alternative forsyningsveje
- ringforbindelser
- status på haner
- beregning af isolerede netsegmenter
- automatisk liste over berørte adresser

PostGIS-funktioner og eventuelt pgRouting kan anvendes senere.

## 17. Revisionslog

Alle væsentlige ændringer skal registreres.

Audit-log skal mindst indeholde:

- bruger
- tidspunkt
- handling
- objekttype
- objekt-ID
- tidligere data
- nye data
- IP eller session, hvis relevant

Loggen må ikke kunne redigeres af almindelige brugere.

## 18. Backup og restore

Der skal tages daglig backup af:

- PostgreSQL
- uploads
- konfiguration

Forslag:

```text
/backups/database
/backups/uploads
```

Der skal være:

- rotationspolitik
- dokumenteret restore
- test af restore
- mulighed for kopi til anden enhed

Eksempelkommandoer:

```bash
docker compose exec db pg_dump -U app app > backup.sql
docker compose exec -T db psql -U app app < backup.sql
```

## 19. Healthchecks

Endpoint:

```http
GET /api/health
```

Skal kontrollere:

- backend
- database
- migrationsstatus
- filsystem
- worker, hvis aktiv

Docker Compose skal anvende healthchecks.

## 20. Sikkerhed

Løsningen skal:

- anvende HTTPS
- have rate limiting
- validere input
- beskytte mod SQL injection
- beskytte mod XSS
- beskytte mod CSRF, hvor relevant
- anvende sikre cookies
- undgå hemmeligheder i Git
- validere filer
- begrænse filstørrelser
- have rollebaseret adgang
- have revisionslog
- have backup

Cloudflare Tunnel må ikke give direkte adgang til databasen.

## 21. Tests

Der skal mindst være tests for:

- login
- roller
- oprettelse af hændelse
- statusændringer
- valg af haner
- lukkeområder
- berørte adresser
- manuel korrektion
- offentlig driftsstatus
- henvendelser
- kortrettelser
- rettigheder
- revisionslog

Backend:

- pytest

Frontend:

- Vitest
- React Testing Library

End-to-end:

- Playwright

## 22. Udviklingsfaser

### Fase 1 – Fundament

- projektstruktur
- Docker Compose
- PostgreSQL/PostGIS
- backend
- frontend
- login
- roller
- migrations
- healthchecks

### Fase 2 – Kort og grunddata

- kortvisning
- adresser
- haner
- ledninger
- lukkeområder
- seed-data
- QGIS-dokumentation

### Fase 3 – Hændelser

- registrering
- kortplacering
- billeder
- status
- ansvarlig
- kommentarer
- historik
- notifikation

### Fase 4 – Vandlukning

- valg af haner
- lukkeområder
- berørte adresser
- manuel korrektion
- CSV
- informationsstatus

### Fase 5 – Henvendelser og kortrettelser

- beboerhenvendelser
- opfølgning
- kortrettelser
- leverandørworkflow
- opgaver

### Fase 6 – Offentlig driftsstatus

- offentlig tekst
- godkendelse
- API
- JSON-fil
- afslutning

### Fase 7 – Drift og kvalitet

- backup
- restore
- sikkerhed
- tests
- NAS-deployment
- Cloudflare Tunnel
- dokumentation

## 23. Instruktion til Codex

Codex skal arbejde i én fase ad gangen.

Efter hver fase skal Codex:

1. beskrive ændringerne
2. vise ændrede filer
3. opdatere tests
4. opdatere dokumentation
5. bygge Docker-images
6. køre tests
7. kontrollere migrations
8. beskrive kendte begrænsninger

Codex må ikke:

- slette migrationsfiler uden begrundelse
- ændre datamodel uden migration
- hardcode hemmeligheder
- eksponere PostgreSQL offentligt
- publicere interne data gennem det offentlige API
