# Sikkerhed

## Implementerede kontroller

- Produktionsstart kræver en unik `AUTH_SECRET_KEY` på mindst 32 tegn og `AUTH_COOKIE_SECURE=true`.
- Sessionscookie er `HttpOnly`, `Secure`, `SameSite=Strict`, tidsbegrænset og scoped til `/api`.
- Login er rate-begrænset, adgang er rollebaseret, og væsentlige ændringer auditeres.
- PostgreSQL og backend eksponeres ikke i produktions-Compose; webporten binder til localhost.
- Nginx sætter CSP med `blob:` kun for MapLibre-workers, `nosniff`, frame-beskyttelse, referrer- og permissions-policy.
- Uploadgrænsen er 10 MiB ved proxy og backend; filtyper og indhold valideres i applikationen.
- Offentlig status bygger kun på aktivt godkendte snapshots og deles via et read-only frontend-volume.
- Backups har SHA-256-integritetskontrol. Checksummer er ikke digitale signaturer; beskyt backupmålet mod ændring.

## Driftskrav

- Commit aldrig `.env`, tunnel-token, SMTP-kode, databasekode eller produktionsbackup.
- Brug en password manager, mindst privilegerede konti og separate QGIS-legitimationsoplysninger.
- Patch NAS, Docker, images og afhængigheder regelmæssigt; gennemgå release notes før større versionshop.
- Begræns `/docs` og `/openapi.json` med Cloudflare Access eller Nginx i en senere hardening, hvis offentlig API-dokumentation ikke ønskes.
- Overvåg loginfejl, 5xx, tunnelstatus, diskplads, backupalder og revisionslog.
- Ved hændelse: isolér ekstern adgang, bevar logs, rotér berørte hemmeligheder, kontrollér audit og gendan kun fra kendt god backup.

## Kendte risici

Bearer-tokenet returneres fortsat af login af hensyn til tests og eksterne API-klienter. Browseren skal alene bruge cookie; tokenet må ikke persisteres. Rate-limit er proceslokalt. CSP tillader inline styles, som MapLibre og eksisterende UI kræver, men tillader ikke inline scripts. Cloudflare-healthchecket beviser binærens tilstedeværelse, ikke aktiv tunneltrafik.
