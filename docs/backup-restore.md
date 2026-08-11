# Backup og restore

## Indhold og format

`./scripts/backup.sh` indlæser eksplicit projektets `.env`, eller `.env.dev` når `.env` ikke findes. Det opretter et PostgreSQL custom-format dump, et komprimeret uploadarkiv, en SHA-256-sidecar og et manifest med tidspunkt, størrelser og Alembic-revision. Filer skrives som `.partial` og omdøbes først efter succes.

Backup-profilen gør det samme periodisk. Standardrotationen er 14 dage. Et typisk sæt er:

```text
backups/database/gavadr-20260807T120000Z.dump
backups/uploads/uploads-20260807T120000Z.tar.gz
backups/gavadr-20260807T120000Z.sha256
backups/gavadr-20260807T120000Z.manifest
```

Start og manuel kørsel:

```bash
docker compose --profile backup up -d backup
./scripts/backup.sh
```

Kopiér hele sættet til et krypteret, fysisk separat mål. `.env` skal sikkerhedskopieres separat og krypteret; scripts kopierer bevidst ikke hemmeligheder.

## Restore

Restore stopper backend-writeren, terminerer forbindelser til måldatabasen, genskaber databasen, anvender dumpet, erstatter uploads via en isoleret engangsservice, kører migrations og venter på backend-health. Frontend kan vise midlertidige API-fejl under forløbet.

```bash
./scripts/restore.sh backups/database/gavadr-20260807T120000Z.dump
./scripts/restore.sh backups/database/ekstern.dump backups/uploads/ekstern.tar.gz
./scripts/restore.sh backups/database/ældre.dump --database-only
```

Det matchende uploadarkiv vælges automatisk ud fra tidsstemplet. Mangler det, skal `--database-only` vælges eksplicit. Arkivstier valideres før sletning og udpakning. En tilgængelig checksum-sidecar kontrolleres før bekræftelsen. Ældre backups uden sidecar giver en tydelig advarsel.

Kør aldrig et restore-drill på produktionsdata. Brug en separat Compose-projektmappe, separate volumes og en separat port. Godkend først en backup efter login, fil-download, kortdata, seneste migration og begge offentlige statusendpoints er kontrolleret.

## Driftskrav

- Overvåg fri plads, backupservice og `.partial`-filer.
- Bevar flere generationer og mindst én offline/offsite-kopi.
- Test restore kvartalsvist på en isoleret installation og registrér dato, backup-ID, varighed og resultat.
- PostgreSQL-dump og uploadarkiv tages sekventielt, ikke som ét tværgående transaktionssnapshot. Undgå filændringer under manuel backup, når fuld database/fil-konsistens er kritisk.
