# Deployment

## Produktionsforberedelse

1. Kopiér `.env.example` til `.env`, sæt unikke lange værdier, og begræns filrettighederne til NAS-administratoren.
2. Behold `APP_ENV=production` via Compose og `AUTH_COOKIE_SECURE=true`; backend nægter at starte med usikker cookie i produktion.
3. Behold `WEB_BIND_ADDRESS=127.0.0.1`, medmindre en dokumenteret lokal reverse proxy kræver andet.
4. Kontrollér at `UPLOAD_MAX_BYTES=10485760`; Nginx og backend accepterer højst 10 MiB.
5. Kør `docker compose config --quiet` og gennemgå `docker compose config` uden at dele outputtet, da det indeholder udfoldede hemmeligheder.
6. Start med `docker compose up --build -d` og opret administratoren med `./scripts/create_admin.sh <e-mail> "<navn>"`.
7. Kør `./scripts/release-check.sh` og kontrollér `docker compose ps` samt logs.

Database, uploads og offentlig status ligger i navngivne volumes. Backend monterer offentlig status read/write; frontend monterer samme volume read-only. Filen serveres kun på den eksakte sti `/public/driftsstatus.json`.
`PUBLIC_STATUS_FILENAME` skal derfor forblive `driftsstatus.json`; backend afviser andre værdier i produktion.

## Kortfliser

Standard er OpenStreetMap.de via samme origin på `/tiles/`. Nginx skjuler cookies, sender en identificerbar User-Agent og cacher succesfulde fliser i op til syv dage. Respektér udbyderens tile policy og attribution.

`MAP_BASE_URL` og de øvrige kortvariabler er reserveret integrationskonfiguration; den nuværende Nginx-proxy skifter ikke upstream dynamisk. En alternativ XYZ/WMTS/WMS-udbyder kræver en bevidst Nginx-/frontendkonfiguration og kontrol af licens, attribution, CSP og cachevilkår. Send aldrig leverandørnøgler til browseren.

## Opdatering

1. Tag og kopiér en verificerbar backup væk fra NAS'en.
2. Notér nuværende image-/kildeversion og læs migrationsændringer.
3. Kør `docker compose build --pull` og `docker compose up -d`.
4. Backend kører `alembic upgrade head` før opstart.
5. Kør `./scripts/release-check.sh` og gennemgå logs.
6. Rul kun tilbage til en databasekompatibel version; ellers gendan den tilhørende backup efter restore-runbooken.

Se `docs/nas-cloudflare.md`, `docs/security.md`, `docs/backup-restore.md` og `docs/release.md`.
