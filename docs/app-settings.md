# App-indstillinger

Siden **App-indstillinger** findes på `/indstillinger` og er kun synlig for administratorer. Backend kontrollerer også administratorrollen, så siden og dens API kan ikke bruges af andre roller via direkte requests.

## Vandværkets navn og sted

Administrator kan ændre:

- vandværkets navn,
- adresse,
- lokalitet, eksempelvis `4293 Dianalund`.
- kortets standardcentrum og zoom på Overblik, Ledningskortet og ved registrering af en ny hændelse.

Oplysningerne vises i driftssystemets logo og topbjælke, på login, i den præcise offentlige forhåndsvisning og på `/drift`. Åbne browsere henter ændringer senest efter 60 sekunder.

Før der er gemt værdier i databasen, bruges disse miljøvariabler:

```env
ORGANIZATION_NAME=GAVAD
ORGANIZATION_ADDRESS=
ORGANIZATION_LOCALITY=
MAP_DEFAULT_LONGITUDE=11.45
MAP_DEFAULT_LATITUDE=55.62
MAP_DEFAULT_ZOOM=13
```

Når administratoren gemmer i browseren, har databaseværdierne forrang for miljøvariablerne.

Standardudsnittet vælges ved at klikke og zoome på kortet under **Vandværkets oplysninger**. Zoom kan også indtastes mellem 0 og 19. Overblik og Ledningskortet åbner altid ved det gemte udsnit, også når der findes aktuelle driftssager. Når en medarbejder vælger **Angiv på kort** under **Registrer hændelse**, åbner kortet ved samme udsnit. Punktet bliver ikke automatisk gemt som hændelsens placering; medarbejderen skal stadig klikke på det konkrete hændelsessted.

## CSV-import af adresser

CSV-importen opretter kun nye adresser. Eksisterende adresser flyttes eller ændres aldrig af importen.

Mindste filformat:

```csv
adresse;postnummer;lokalitet;x;y
Gadeledsvej 66A;4293;Dianalund;654930.12;6169200.45
```

`adresse` kan erstattes af kolonnerne `vejnavn` og `husnummer`. Valgfrie kolonner er:

- `eksternt_adresse_id`, eksempelvis DAR-ID,
- `aktiv`, med værdien ja/nej, true/false eller 1/0,
- `noter`.

Vælg koordinatsystemet, som filen faktisk bruger:

- `EPSG:25832` til ETRS89 / UTM zone 32N med X/Y i meter,
- `EPSG:4326` til længdegrad og breddegrad.

Arbejdsgangen er:

1. Vælg CSV-filen og koordinatsystemet.
2. Vælg **Kontrollér fil**.
3. Kontrollér antal gyldige og oversprungne adresser.
4. Hent eventuelt fejlrapporten som CSV for at se alle rækkenumre, der ikke kan importeres.
5. Vælg **Importér gyldige rækker**. Rækker med fejl springes over og kan rettes og importeres senere.
6. Kontrollér de nye punkter på Ledningskortet.

Importen accepterer højst 5.000 adresser og 2 MiB pr. fil som standard. Grænserne kan ændres med `ADDRESS_IMPORT_MAX_ROWS` og `ADDRESS_IMPORT_MAX_BYTES`.

Importerede adresser kobles ikke automatisk til lukkeområder. Følg [`address-import-guide.md`](address-import-guide.md) for faglig kontrol og relationer i QGIS.
