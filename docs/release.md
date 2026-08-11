# Releasecheckliste

## Før release

1. Bekræft godkendt ændringsomfang, kendte begrænsninger og migrationssti.
2. Kør backend-tests, shell-syntakscheck og `docker compose config --quiet`.
3. Byg images uden fejl og kontrollér afhængigheds-/imageopdateringer.
4. Tag `./scripts/backup.sh`, verificér checksum, og kopiér sættet offsite.
5. Bekræft fri diskplads, kontaktperson og vedligeholdelsesvindue.

## Efter release

1. Kontrollér at alle forventede services er healthy og at migrationsrevisionen er `head`.
2. Kør `./scripts/release-check.sh https://<hostname>`.
3. Test login/logout, rollebeskyttelse, kort/fliser, 10 MiB-grænse og en autoriseret download.
4. Kontrollér `/api/public/driftsstatus`; kontrollér den statiske fil efter en godkendt publicering.
5. Kontrollér Cloudflare TLS, cache-regler, tunnelstatus og applikationslogs.
6. Registrér version, tidspunkt, operatør, backup-ID, migration og resultat.

Et restore-drill udføres kun på en separat installation. En release godkendes ikke alene på baggrund af containerstatus; applikations-health og centrale brugerflows skal bestå.
