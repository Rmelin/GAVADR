# Vejledning: få adresser ind i systemet

Adresser kan importeres fra CSV under **App-indstillinger** i websystemet eller oprettes og redigeres i QGIS. Begge arbejdsgange gemmer i PostGIS-tabellen `addresses`.

Webimporten er adminbeskyttet og anbefales til kontrollerede CSV-filer med nye adressepunkter. Den gennemfører altid en forhåndskontrol og ændrer aldrig eksisterende adresser. Brug QGIS, når eksisterende punkter skal flyttes eller redigeres, eller når adresser skal kobles til lukkeområder.

Brug denne vejledning til enten at oprette enkelte adresser manuelt eller importere mange adresser fra CSV, GeoPackage eller et andet GIS-format.

## Før du begynder

1. Kør `./scripts/backup.sh` fra projektets rodmappe.
2. Kontrollér at database, backend og frontend er `healthy`.
3. Opret om nødvendigt QGIS-brugeren med `./scripts/create_qgis_user.sh`.
4. Forbind QGIS til databasen som beskrevet i [`admin-map-guide.md`](admin-map-guide.md).
5. Tilføj tabellen `addresses` fra PostgreSQL-forbindelsen som et redigerbart punktlag.
6. Kontrollér at laget bruger **ETRS89 / UTM zone 32N, EPSG:25832**.

Brug aldrig databaseejeren som almindelig QGIS-bruger. Produktionsdatabasen må kun nås via godkendt lokalt netværk eller VPN, aldrig via en offentlig tunnel.

## Adressens felter

Hver adresse skal have en punktgeometri og disse oplysninger:

| Felt | Krav | Eksempel |
|---|---|---|
| `external_address_id` | Valgfrit, men anbefalet stabilt og unikt ID fra kilden, eksempelvis DAR-ID | `0a3f...` |
| `street_name` | Påkrævet vejnavn, højst 120 tegn | `Gadeledsvej` |
| `house_number` | Påkrævet husnummer inklusive eventuelt bogstav, højst 20 tegn | `66A` |
| `postal_code` | Påkrævet postnummer med præcis fire tegn | `4293` |
| `city` | Påkrævet bynavn, højst 100 tegn | `Dianalund` |
| `geometry` | Påkrævet punktgeometri i EPSG:25832 | punkt ved adressen |
| `active` | Skal være `true`, hvis adressen skal kunne indgå i vandlukninger | `true` |
| `notes` | Valgfri intern note om eksempelvis kilde eller usikkerhed | `Importeret 2026-08-08` |

Lad databasefelterne `id`, `created_at` og `updated_at` blive udfyldt automatisk. Lad `updated_by` og `deleted_at` være tomme. Gem postnummeret som tekst, så eventuelle foranstillede nuller ikke mistes.

## Mulighed A: opret en enkelt adresse

1. Åbn laget `addresses` i QGIS.
2. Slå redigering til.
3. Vælg **Tilføj punktobjekt**.
4. Placér punktet ved den dokumenterede adresseposition eller ejendommens forsyningspunkt.
5. Udfyld de påkrævede felter fra tabellen ovenfor.
6. Sæt `active` til `true`.
7. Gem redigeringen og slå redigering fra.
8. Genindlæs **Ledningskort** i websystemet, og søg efter vejnavnet.

Hvis adressen allerede findes, skal den eksisterende række rettes i stedet for at oprette en dublet. Genbrug aldrig et `external_address_id`.

## Mulighed B: importér mange adresser

### 1. Klargør kildefilen

Kilden kan eksempelvis være CSV, GeoPackage, Shape eller et udtræk fra et autoritativt adresseregister. Filen skal som minimum kunne levere vejnavn, husnummer, postnummer, by og en position.

En CSV kan enten indeholde:

- koordinatkolonner som `x` og `y`, eller
- adresser uden geometri, som først geokodes og fagligt kontrolleres i et separat arbejdstrin.

Eksempel på CSV med koordinater i EPSG:25832:

```csv
external_address_id;street_name;house_number;postal_code;city;x;y;active;notes
DAR-001;Gadeledsvej;66A;4293;Dianalund;654930.12;6169200.45;true;DAR-import 2026-08-08
```

Bekræft altid hvilket koordinatsystem kildefilens koordinater bruger. Tildel ikke EPSG:25832 til data, der reelt er i et andet koordinatsystem.

### 2. Indlæs som midlertidigt QGIS-lag

1. Vælg **Lag > Tilføj lag > Tilføj afgrænset tekstlag**, hvis kilden er CSV.
2. Vælg semikolon som skilletegn, hvis filen følger eksemplet ovenfor.
3. Vælg `x` som X-felt og `y` som Y-felt.
4. Angiv kildefilens faktiske CRS.
5. Tilføj laget uden at skrive til `addresses` endnu.
6. Eksportér eller reprojicér arbejdslaget til EPSG:25832, hvis kilden bruger et andet CRS.

Ved GeoPackage eller Shape tilføjes kildelaget direkte, hvorefter lagets CRS og geometri kontrolleres.

### 3. Rens og kontrollér data

Kontrollér før import:

- at alle objekter er punktgeometrier,
- at vejnavn, husnummer, postnummer og by er udfyldt,
- at postnumre består af præcis fire tegn,
- at husnummerets bogstav ikke ligger i et separat, glemt felt,
- at punkterne ligger i det forventede forsyningsområde,
- at `external_address_id` ikke forekommer flere gange,
- at samme vejnavn, husnummer og postnummer ikke allerede findes i `addresses`,
- at der ikke medtages personnavne eller andre unødvendige personoplysninger.

Brug QGIS-værktøjet **Kontrollér gyldighed** på geometrien. Importér først et lille udsnit, eksempelvis 5-10 adresser.

### 4. Tilføj objekterne til `addresses`

1. Markér de kontrollerede objekter i arbejdslaget.
2. Kopiér de valgte objekter.
3. Slå redigering til på PostgreSQL-laget `addresses`.
4. Indsæt objekterne i `addresses`.
5. Kontrollér feltmappingen i attributformularen eller importdialogen.
6. Overfør kun `external_address_id`, `street_name`, `house_number`, `postal_code`, `city`, `active`, `notes` og geometrien.
7. Lad `id`, tidsstempler, `updated_by` og `deleted_at` bruge databaseværdierne.
8. Gem redigeringerne.

Hvis QGIS ikke tilbyder en tydelig feltmapping ved kopiering, bruges **Database > DB Manager > Importér lag/fil** med indstillingen for at tilføje objekter til den eksisterende tabel `addresses`. Opret ikke en ny tabel med et andet navn, og overskriv aldrig `addresses`.

Stop ved første databasefejl. Ret kildelaget og prøv igen med et lille udsnit i stedet for at fjerne databasens constraints.

### 5. Kontrollér prøveimporten

1. Genindlæs **Ledningskort** i websystemet.
2. Slå adresselaget til.
3. Søg efter vejnavn og husnummer.
4. Klik på punkterne og kontrollér adresseoplysningerne.
5. Sammenlign placeringen med den autoritative kilde.
6. Kontrollér at inaktive, slettede eller dublerede adresser ikke er kommet med.

Når prøveimporten er godkendt, gentages processen for resten af dataene i kontrollerbare portioner.

## Kobl adresser til lukkeområder

En importeret adresse bliver ikke automatisk berørt af en vandlukning, blot fordi punktet ligger inde i et lukkeområde. Adressen skal også kobles til området i `closure_area_addresses`.

1. Kontrollér adressen og lukkeområdet på kortet.
2. Find adressens `id` i `addresses` og områdets `id` i `closure_areas`.
3. Opret en række i `closure_area_addresses`.
4. Sæt `address_id` og `closure_area_id` til de to UUID'er.
5. Lad `deleted_at` være tomt, og gem.

Ved mange adresser kan QGIS-funktionen **Vælg efter placering** bruges til at finde kandidater inden for et lukkeområde. Kandidaterne skal gennemgås fagligt, før relationerne oprettes. En adresse kan godt være tilknyttet flere lukkeområder.

## Afsluttende kontrol

1. Opret en prøvevandlukning i websystemet.
2. Vælg den relevante hane eller det relevante lukkeområde.
3. Kontrollér at de forventede adresser vises som berørte.
4. Eksportér adresselisten som CSV og sammenlign den med kilden.
5. Aflys eller slet testsagen efter kontrollen.

Adresserne er først klar til drift, når både kortplacering, attributter og koblingen til lukkeområder er kontrolleret.

## Typiske fejl

### Adressen vises ikke på kortet

- Kontrollér at geometrien er et gyldigt punkt i EPSG:25832.
- Kontrollér at `active=true` og `deleted_at` er tomt.
- Kontrollér at de obligatoriske tekstfelter er udfyldt.
- Genindlæs webkortet efter gemte QGIS-ændringer.

### Databasen afviser importen

- Et `external_address_id` findes allerede.
- `postal_code` har ikke præcis fire tegn.
- Et obligatorisk felt eller geometrien mangler.
- Teksten er længere end feltets maksimale længde.
- QGIS forsøger at indsætte tomme værdier i databaseadministrerede felter i stedet for at bruge standardværdierne.

### Adressen vises ikke i en vandlukning

- Kontrollér at adressen er aktiv.
- Kontrollér at relationen i `closure_area_addresses` findes og ikke har `deleted_at`.
- Kontrollér at lukkeområdet er aktivt og koblet til den valgte hane.
- Genberegn vandlukningen. Eksisterende sager opdateres ikke automatisk efter GIS-ændringer.
