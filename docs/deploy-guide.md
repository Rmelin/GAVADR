# Deploy GAVADR med GitHub Packages og Cloudflare Tunnel

Denne vejledning installerer GAVADR på en Docker-maskine via SSH. Applikationen hentes som færdigbyggede images fra GitHub Container Registry (GHCR), og Cloudflare Tunnel giver HTTPS-adgang uden at åbne en offentlig webport i routeren.

## Forudsætninger

Du skal have:

- en Cloudflare-konto med et domæne, hvor du kan oprette en Cloudflare Tunnel og hente dens token,
- SSH-adgang til en Linux-maskine eller NAS med Docker Engine og Docker Compose-plugin,
- projektet på GitHub,
- de publicerede GHCR-images `gavadr-frontend` og `gavadr-backend`,
- en GitHub-bruger eller token med `read:packages`, hvis pakkerne er private.

Eksemplerne bruger:

- GitHub-ejer: `<github-owner>`,
- Git-repository: `https://github.com/<github-owner>/GAVADR.git`,
- offentlig adresse: `https://drift.example.dk`,
- installationsmappe: `/opt/gavadr`.

Erstat værdierne med dine egne. GitHub-ejeren skal skrives med små bogstaver i image-navne.

## 1. Kontrollér images på GitHub

Workflowet `.github/workflows/publish-images.yml` publicerer kun ved versions-tags i formatet `x.y.z`, eksempelvis `0.0.1`. Almindelige commits og merges til `main` publicerer ikke produktionsimages:

```text
ghcr.io/<github-owner>/gavadr-frontend:latest
ghcr.io/<github-owner>/gavadr-backend:latest
ghcr.io/<github-owner>/gavadr-frontend:0.0.1
ghcr.io/<github-owner>/gavadr-backend:0.0.1
```

Hvert release publiceres både med versionstagget og som `latest`. Brug versionstagget i produktion, så installationen ikke ændres, før du bevidst vælger en ny version.

Hvis pakkerne er offentlige, kan Docker hente dem uden login. Hvis de er private, skal serveren logge ind med et GitHub Personal Access Token med mindst `read:packages`:

```bash
printf '%s' '<github-token>' | docker login ghcr.io -u '<github-bruger>' --password-stdin
```

Gem ikke tokenet i projektets `.env` eller i Git.

## 2. Forbered serveren via SSH

Log ind og kontrollér Docker:

```bash
ssh <bruger>@<server>
docker version
docker compose version
```

Opret installationsmappen og hent projektet:

```bash
sudo mkdir -p /opt/gavadr
sudo chown "$USER":"$USER" /opt/gavadr
git clone https://github.com/<github-owner>/GAVADR.git /opt/gavadr
cd /opt/gavadr
```

### NAS uden Git

Nogle NAS-systemer leveres uden Git og har leverandørstyrede pakkekilder, hvor `apt install git` ikke kan bruges sikkert. Undgå at køre `apt --fix-broken install`, medmindre NAS-leverandørens dokumentation specifikt anbefaler det.

Når Docker allerede virker, kan Git køres i en midlertidig container. Fra den mappe, hvor GAVADR skal ligge:

```bash
cd /volume2/docker
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  -w /workspace \
  alpine/git clone https://github.com/<github-owner>/GAVADR.git gavadr
cd /volume2/docker/gavadr
```

Brug `sudo docker` i kommandoen, hvis brugerens konto ikke har adgang til Docker. Undgå destinationsstien `/gavadr`, som placerer projektet i serverens rodfilsystem og normalt kræver særskilte rettigheder.

Hvis GitHub-repositoriet er offentligt, kan kildearkivet alternativt hentes uden Git:

```bash
cd /volume2/docker
curl -fL https://github.com/<github-owner>/GAVADR/archive/refs/heads/main.tar.gz -o GAVADR-main.tar.gz
tar -xzf GAVADR-main.tar.gz
mv GAVADR-main gavadr
rm GAVADR-main.tar.gz
cd /volume2/docker/gavadr
```

Hvis den eksisterende `gavadr`-mappe tidligere blev hentet som ZIP eller tar-arkiv, indeholder den ikke `.git`, og `git pull` vil fejle med `fatal: not a git repository`. Konvertér installationen til en rigtig Git-klon uden at miste `.env`:

```bash
cd /volume2/docker

sudo docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  -w /workspace \
  alpine/git clone https://github.com/<github-owner>/GAVADR.git gavadr-new

cp gavadr/.env gavadr-new/.env
mv gavadr gavadr-old
mv gavadr-new gavadr
cd gavadr
```

Kontrollér den nye installation, før `gavadr-old` slettes. Docker-volumes bevares, fordi Compose-projektnavnet fortsat er `gavadr`.

Projektfilerne er nødvendige til Compose-konfiguration, databaseinitialisering, scripts og dokumentation. Backend- og frontendkoden bygges ikke på serveren, når `docker-compose.images.yml` anvendes.

## 3. Opret produktionskonfiguration

Kopiér eksemplet og beskyt filen:

```bash
cp .env.example .env
chmod 600 .env
```

Generér hemmeligheder, eksempelvis med OpenSSL:

```bash
openssl rand -base64 36
openssl rand -hex 32
```

Redigér `.env` og angiv mindst:

```dotenv
POSTGRES_DB=gavadr
POSTGRES_USER=gavadr
POSTGRES_PASSWORD=<unik-lang-databasekode>
AUTH_SECRET_KEY=<mindst-32-tilfældige-tegn>
AUTH_COOKIE_SECURE=true

WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
FRONTEND_URL=https://drift.example.dk

GITHUB_OWNER=<github-owner-med-små-bogstaver>
GAVADR_VERSION=0.0.1

CLOUDFLARE_TUNNEL_TOKEN=<cloudflare-tunnel-token>

ORGANIZATION_NAME=<vandværkets-navn>
ORGANIZATION_ADDRESS=<valgfri-adresse>
ORGANIZATION_LOCALITY=<valgfrit-område>
MAP_DEFAULT_LONGITUDE=11.45
MAP_DEFAULT_LATITUDE=55.62
MAP_DEFAULT_ZOOM=13

BOARD_NOTIFICATION_EMAILS=[]
PUBLIC_STATUS_FILENAME=driftsstatus.json
```

Brug et versions-tag som `GAVADR_VERSION`. Det gør opdatering og rollback mere kontrolleret end `latest`.

Commit aldrig `.env`, databasekoder, SMTP-koder, GitHub-tokens eller tunnel-tokenet.

## 4. Opret Cloudflare Tunnel

I Cloudflare-dashboardet:

1. Åbn **Zero Trust** eller **Networks** og vælg **Tunnels**.
2. Opret en ny Cloudflared-tunnel, eksempelvis `gavadr`.
3. Vælg Docker som connector og kopiér kun tunnel-tokenet efter `--token` fra kommandoen. Brug ikke et almindeligt Cloudflare API-token, og indsæt ikke hele Docker-kommandoen i `.env`.
4. Indsæt tokenet som `CLOUDFLARE_TUNNEL_TOKEN` i serverens `.env`.
5. Opret et **Public hostname**, eksempelvis `drift.example.dk`.
6. Vælg service type `HTTP` og origin URL `http://frontend:80`.

Origin skal være `frontend:80`, fordi Cloudflared kører på samme interne Docker-netværk. Opret ikke offentlige hostnames til `backend`, `db` eller PostgreSQL-porten.

Anbefalet Cloudflare-konfiguration:

- gennemtving HTTPS,
- aktivér passende HSTS, når domænet er testet,
- slå caching fra for `/api/*`, `/docs` og `/openapi.json`,
- cache den offentlige driftsstatus i højst 60 sekunder,
- overvej Cloudflare Access til interne miljøer, men test cookie-login efter aktivering.

## 5. Validér og start GAVADR

Alle produktionskommandoer bruger både grundfilen og image-overridet:

```bash
export COMPOSE="docker compose --env-file .env -f docker-compose.yml -f docker-compose.images.yml"
$COMPOSE config --quiet
$COMPOSE pull
$COMPOSE --profile tunnel up -d
$COMPOSE ps
```

Backend venter på PostgreSQL og kører automatisk `alembic upgrade head` før API'et starter. Frontend publiceres kun på serverens `127.0.0.1:8080`; ekstern adgang går gennem tunnelen.

### UGREEN Docker GUI

UGREEN registrerer ikke nødvendigvis et Compose-projekt i GUI'en, når det er oprettet via SSH. Filen `docker-compose.ugreen.yml` samler image-overridet og tunnelprofilen i én konfiguration, som kan importeres i GUI'en.

Stop først SSH-oprettede containere uden at slette volumes:

```bash
cd /volume2/docker/gavadr
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.images.yml --profile tunnel down
```

Opret derefter projektet i UGREEN Docker:

1. Angiv navnet `gavadr`.
2. Vælg den eksisterende projektmappe, eksempelvis `/volume2/docker/gavadr`, som storage path. Mappen skal indeholde den eksisterende `.env`.
3. Importér `docker-compose.ugreen.yml` som Compose configuration.
4. Behold **Run immediately after creation** valgt, og vælg **Deploy**.

Brug præcis projektnavnet `gavadr`, så de eksisterende `gavadr_postgres_data`, `gavadr_uploads` og `gavadr_public_status` volumes genbruges. Vælg aldrig at slette volumes under overgangen.

Kontrollér logs:

```bash
$COMPOSE logs backend
$COMPOSE logs cloudflared
```

Kontrollér lokalt på serveren:

```bash
./scripts/release-check.sh http://127.0.0.1:8080
```

Kontrollér derefter gennem Cloudflare:

```bash
./scripts/release-check.sh https://drift.example.dk
```

## 6. Opret den første administrator

Kør administratorværktøjet i backend-containeren:

```bash
$COMPOSE exec backend python -m app.cli create-admin \
  admin@example.dk "Administrator"
```

Kommandoen beder om adgangskoden interaktivt. Log derefter ind på `https://drift.example.dk` og kontrollér roller, organisationsnavn og standardkortcentrum.

## 7. Vis driftsstatus på hovedhjemmesiden

Den offentlige side kræver ikke login:

```text
https://drift.example.dk/drift
```

Den kan indlejres på vandværkets hovedhjemmeside:

```html
<iframe
  title="Aktuel driftsinformation"
  src="https://drift.example.dk/drift?embed=1"
  loading="lazy"
  style="width:100%;min-height:620px;border:0"
></iframe>
```

Der findes også et offentligt JSON-feed:

```text
https://drift.example.dk/api/public/driftsstatus
https://drift.example.dk/public/driftsstatus.json
```

Kun godkendte driftsmeddelelser publiceres. Planlagte vandlukninger fjernes automatisk fra det offentlige feed efter forventet afslutning eller ved aflysning.

## 8. Aktivér backup

Start den automatiske backupservice sammen med tunnelen:

```bash
$COMPOSE --profile tunnel --profile backup up -d
```

Manuel backup kan køres med projektets script:

```bash
./scripts/backup.sh
```

Scriptet bruger den aktive Compose-installation og opretter databasedump, uploadsarkiv, checksum og manifest under `backups/`. Kopiér backups til et separat, beskyttet mål. RAID eller samme server er ikke en tilstrækkelig backup.

Læs `backup-restore.md`, og gennemfør en restore-test på en separat installation før produktionsgodkendelse.

## 9. Opdatér installationen

Tag først backup. Hent derefter ny Compose-konfiguration og nye images:

```bash
cd /opt/gavadr
./scripts/backup.sh
git pull --ff-only
export COMPOSE="docker compose --env-file .env -f docker-compose.yml -f docker-compose.images.yml"
$COMPOSE pull
$COMPOSE --profile tunnel --profile backup up -d
$COMPOSE ps
./scripts/release-check.sh https://drift.example.dk
```

Når `GAVADR_VERSION` er et versions-tag, skal værdien ændres bevidst i `.env` før `pull`. Notér den tidligere værdi, så applikationsimages kan vælges igen ved rollback. Rul kun tilbage til en version, der er kompatibel med den aktuelle databasemigration.

## 10. Fejlfinding

### Image kan ikke hentes

Kontrollér image-navn, at `GITHUB_OWNER` er med små bogstaver, og at pakken er offentlig. Ved private pakker skal Docker være logget ind med `read:packages`.

```bash
docker pull ghcr.io/<github-owner>/gavadr-backend:latest
docker pull ghcr.io/<github-owner>/gavadr-frontend:latest
```

### Git pull siger not a git repository

Mappen er hentet som et kildearkiv og har derfor ingen `.git`-mappe. Brug fremgangsmåden **NAS uden Git** i trin 2 til at klone til `gavadr-new`, bevare `.env` og omdøbe mapperne.

### Tunnelen er ikke forbundet

Kontrollér token, hostname og logs:

```bash
$COMPOSE logs cloudflared
```

Origin i Cloudflare skal være `http://frontend:80`, ikke `localhost:8080`.

Hvis loggen viser `Provided Tunnel token is not valid`, skal du åbne tunnelen i Cloudflare-dashboardet, vælge **Configure** eller **Add a connector**, vælge Docker og kopiere den lange værdi efter `--token`. Linjen i `.env` skal kun indeholde tokenet:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

Gem filen og genopret kun tunnel-containeren:

```bash
$COMPOSE --profile tunnel up -d --force-recreate cloudflared
$COMPOSE logs --tail=100 cloudflared
```

### Backend starter ikke

```bash
$COMPOSE logs db
$COMPOSE logs backend
$COMPOSE exec backend alembic current
```

Typiske årsager er forkert databasekode, for kort `AUTH_SECRET_KEY`, `AUTH_COOKIE_SECURE=false` i produktion eller en fejlet migration.

### Syntetiske områder vises på produktionskortet

Tidlige versioner indsatte illustrative kortobjekter gennem migrationskæden. Migration `20260812_0015` skjuler automatisk de kendte syntetiske adresser, ledninger, haner, lukkeområder og scenarier. Opdatér backend-imaget, og kontrollér at migrationen er kørt:

```bash
$COMPOSE pull backend
$COMPOSE up -d backend
$COMPOSE exec backend alembic current
```

Outputtet skal vise `20260812_0015 (head)`. Genindlæs derefter kortet i browseren.

### Databasen melder Permission denied for initdb

Hvis en ældre Compose-fil viser denne fejl:

```text
ls: can't open '/docker-entrypoint-initdb.d/': Permission denied
```

skal repositoryet opdateres. GAVADR bruger PostGIS-imagets indbyggede initialisering og monterer ikke længere en lokal NAS-mappe på `/docker-entrypoint-initdb.d`.

Ved en helt ny installation uden data kan den fejlede, delvist oprettede databasevolume nulstilles og installationen startes igen:

```bash
$COMPOSE down -v
$COMPOSE --profile tunnel up -d
```

> **Advarsel:** `down -v` sletter hele databasen og må aldrig køres på en installation med data, der skal bevares. På en eksisterende installation skal der først tages backup; fjern derefter kun det gamle initdb-mount og genopret containerne uden `-v`.

### Login virker lokalt, men ikke gennem Cloudflare

Kontrollér at `FRONTEND_URL` bruger det offentlige HTTPS-hostname, at browseren bruger HTTPS, og at Cloudflare ikke cacher `/api/*`. Kontrollér også eventuelle Cloudflare Access-regler.

## Sikkerhed efter installation

- Eksponér aldrig PostgreSQL eller backend direkte på internettet.
- Behold `WEB_BIND_ADDRESS=127.0.0.1`.
- Begræns SSH med nøgler, firewall og mindst mulige rettigheder.
- Opdatér værts-OS, Docker og images regelmæssigt.
- Overvåg tunnelstatus, container-health, diskplads, loginfejl og backupalder.
- Rotér straks tunnel-token og øvrige hemmeligheder ved mistanke om læk.

Se også `security.md`, `backup-restore.md`, `release.md` og `nas-cloudflare.md`.
