# NAS og Cloudflare Tunnel

## NAS

1. Brug en vedligeholdt NAS/VM med understøttet Docker Compose og automatisk sikkerhedsopdatering af værts-OS.
2. Placér projekt og `backups/` på et filsystem med pladsmonitorering; Docker-volumes skal ligge på redundant, lokalt storage.
3. Giv kun driftskontoen adgang til projektet og `.env`. Eksponér ikke Docker-socket, databaseport eller backendport.
4. Behold webbinding på `127.0.0.1`; brug VPN/SSH til administration.
5. Aktivér NAS-firewall, tidsynkronisering, diskalarmer og offsite-backup. RAID er ikke backup.
6. Genstart ikke automatisk midt i backup/restore. Kontrollér `docker compose ps` efter NAS-opdateringer.

## Cloudflare

Opret tunnelen i Cloudflare-dashboardet uden at køre oprettelseskommandoer på produktionsdata. Konfigurér én public hostname med origin `http://frontend:80`, sæt tokenet i `.env`, og start derefter:

```bash
docker compose --env-file .env --profile tunnel config --quiet
docker compose --env-file .env --profile tunnel up -d cloudflared
docker compose ps
docker compose logs cloudflared
```

En tom eller ugyldig token får tunnelen til at fejle; Compose-healthchecket validerer at den fastlåste binær kan starte, mens tunnelens reelle forbindelsesstatus skal overvåges i Cloudflare og logs. Der oprettes ingen tunnel automatisk.

TLS afsluttes hos Cloudflare. Aktivér altid HTTPS, passende HSTS i Cloudflare, WebSocket-understøttelse og rimelige request-/rate-grænser. Slå caching fra for `/api/*`, `/docs` og `/openapi.json`; den offentlige JSON må højst caches omkring 60 sekunder. Kræv Cloudflare Access for interne hostnames, hvis det passer til brugerflowet, men test cookie-login efter aktivering.

Tunnel-ingress må kun pege på frontend. Opret aldrig ingress eller Spectrum-adgang til PostgreSQL. Rotér token ved mistanke om læk, fjern det gamle token i Cloudflare, opdatér `.env`, og genopret kun `cloudflared`-servicen.
