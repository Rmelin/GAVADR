# Vejledning: opret ledningsnettets grunddata

Denne vejledning beskriver, hvordan en kortansvarlig opretter **adresser, ledninger, haner og lukkeområder** i QGIS og kobler dataene korrekt til vandlukningsfunktionen.

Webapplikationen bruges til at se og kontrollere grunddata. Selve oprettelsen og redigeringen foregår i QGIS direkte mod PostGIS.

## Før du begynder

1. Tag backup med `./scripts/backup.sh` før større ændringer eller import.
2. Start systemet, og kontrollér at services er `healthy`.
3. Opret QGIS-brugeren med `./scripts/create_qgis_user.sh`.
4. Forbind QGIS til PostgreSQL via lokalt netværk eller VPN. PostgreSQL må aldrig eksponeres gennem Cloudflare Tunnel.
5. Kontrollér at alle redigeringslag bruger **ETRS89 / UTM zone 32N, EPSG:25832**.

OpenStreetMap kan tilføjes som XYZ-baggrund i QGIS. OSM er kun visuel reference og må ikke bruges som dokumentation for den præcise placering af jordlagte installationer.

## Anbefalet rækkefølge

Opret data i denne rækkefølge:

1. Adresser.
2. Ledninger.
3. Haner.
4. Lukkeområder.
5. Relationer fra lukkeområder til haner og adresser.
6. Kontrol i webkortet og en prøvekørsel med en vandlukning.

Rækkefølgen er vigtig, fordi relationerne først kan oprettes, når de tilknyttede objekter har fået UUID'er i databasen.

## Arbejd sikkert i QGIS

1. Tilføj tabellerne `addresses`, `pipes`, `valves` og `closure_areas` som redigerbare lag.
2. Tilføj `closure_scenarios`, `closure_scenario_areas`, `closure_scenario_valves` og `closure_area_addresses`, når relationerne skal kontrolleres. Scenarier redigeres kun i websystemet.
3. Slå kun redigering til på det lag, du arbejder med.
4. Gem efter en lille, kontrollerbar gruppe objekter.
5. Lad `id`, `created_at` og `updated_at` blive udfyldt af databasen.
6. Lad `deleted_at` være tomt for aktive rækker.
7. Lad `updated_by` være tomt ved direkte QGIS-redigering, medmindre der anvendes et gyldigt bruger-UUID fra applikationen.

Aktivér snapping i QGIS, så ledninger og haner placeres konsistent. Brug gerne 0,1-0,3 meter som arbejdspræcision, hvis datakilden understøtter det. Den præcise tolerance skal afspejle opmålingens kvalitet.

## 1. Opret adresser

Åbn laget `addresses`, slå redigering til, og vælg **Tilføj punktobjekt**. Placér punktet ved ejendommens forsyningspunkt eller den dokumenterede adresseposition.

En komplet arbejdsgang for både enkelte adresser og masseimport fra CSV eller GIS-filer findes i [`address-import-guide.md`](address-import-guide.md).

Udfyld:

| Felt | Krav og eksempel |
|---|---|
| `external_address_id` | Valgfri unik ekstern nøgle, eksempelvis DAR-ID. Genbrug aldrig samme værdi. |
| `street_name` | Påkrævet vejnavn, eksempelvis `Bøgevej`. |
| `house_number` | Påkrævet husnummer inklusive bogstav, eksempelvis `12A`. |
| `postal_code` | Påkrævet postnummer med præcis fire tegn, eksempelvis `4293`. |
| `city` | Påkrævet bynavn. |
| `active` | `true` for adresser, der skal indgå i beregninger. |
| `notes` | Valgfri intern datanote. Undgå unødvendige personoplysninger. |

Kontrollér, at samme adresse ikke allerede findes. En inaktiv adresse kan stadig ses af administratorer, men indgår ikke i beregningen af berørte adresser.

## 2. Opret ledninger

Åbn laget `pipes`, slå redigering til, og vælg **Tilføj linjeobjekt**. Tegn fra dokumenteret knudepunkt til knudepunkt. Afslut ikke linjen tilfældigt midt i en forbindelse.

Udfyld:

| Felt | Krav og eksempel |
|---|---|
| `code` | Påkrævet, unikt og stabilt ID, eksempelvis `LED-0042`. |
| `pipe_type` | Vælg Hovedforsyningsledning (`main`), Fordelingsledning (`distribution`) eller Stikledning (`service`). Brug ikke andre stavemåder. |
| `material` | Eksempelvis `PE`, `PVC` eller `cast_iron`. |
| `diameter_mm` | Positiv diameter i millimeter. |
| `installation_year` | Firecifret år mellem 1800 og 2200, hvis kendt. |
| `status` | Normalt `in_service`. |
| `active` | `true` for ledninger i drift. |
| `condition` | Eksempelvis `good`, `fair`, `poor` eller en lokalt aftalt værdi. |
| `risk_probability` | Valgfri vurdering fra 1 til 5. |
| `risk_consequence` | Valgfri vurdering fra 1 til 5. |
| `source` | Opmåling, leverandørfil eller anden datakilde. |
| `quality` | Dokumenteret kvalitetsniveau. |
| `notes` | Intern bemærkning. |

Brug ikke risikoværdi `0` som erstatning for “ukendt”; lad i stedet feltet være tomt. Kontrollér, at linjen ikke har selvskæringer eller utilsigtede knæk.

Brug **Hovedforsyningsledning** til den overordnede ledning gennem forsyningsområdet, **Fordelingsledning** til en forgreningsledning, der forsyner flere ejendomme, og **Stikledning** til tilslutningen frem mod den enkelte ejendom.

Indlæs `docs/qgis-pipes.qml` på laget som beskrevet i `docs/qgis.md`. Så vises hovedforsyningsledninger som kraftige blå linjer, fordelingsledninger som orange linjer og stikledninger som tyndere turkise, stiplede linjer, og `pipe_type` vælges fra en dansk liste.

## 3. Opret haner

Åbn laget `valves`, slå redigering til, og vælg **Tilføj punktobjekt**. Placér hanen på den relevante ledning ud fra opmåling, leverandørdata eller verificeret besigtigelse.

Udfyld:

| Felt | Krav og eksempel |
|---|---|
| `code` | Påkrævet, unikt og stabilt ID, eksempelvis `HAN-0017`. |
| `valve_type` | Eksempelvis `gate`, `section` eller `main_stop`. |
| `network_level` | Vælg Hovedhane (`main`), Fordelingshane (`distribution`) eller Stikhane (`service`) efter den ledning, hanen tilhører. |
| `normal_position` | `open`, `closed` eller `unknown`. |
| `current_position` | `open`, `closed` eller `unknown`. |
| `status` | Normalt `operational`; anvend en aftalt driftsstatus ved fejl eller kontrolbehov. |
| `last_operated_at` | Seneste betjeningstidspunkt, hvis kendt. |
| `last_inspected_at` | Seneste kontroltidspunkt, hvis kendt. |
| `accessibility` | Beskriv adgangsforhold med en lokalt aftalt værdi. |
| `source` | Datakilden. |
| `quality` | Kvaliteten af placering og attributter. |
| `notes` | Intern bemærkning. |

En hane skal have et stabilt `code`, også hvis dens placering senere korrigeres. Opret ikke en ny hane blot for at flytte et eksisterende objekt. `valve_type` og `network_level` er to forskellige oplysninger: den første beskriver selve hanen, mens den anden beskriver dens placering i ledningsnettet.

Indlæs `docs/qgis-valves.qml` på laget. Eksisterende haner uden netniveau vises som **Ikke kategoriseret** og klassificeres manuelt efter faglig kontrol; brug ikke automatisk nærmeste ledning ved kryds eller parallelle ledninger.

## 4. Opret lukkeområder

Et lukkeområde er det område, som forventes at miste vandet, når en eller flere tilknyttede haner lukkes. Området skal være fagligt fastlagt ud fra ledningsplan, forsyningsretning, erfaring og eventuel kontrol i marken.

Åbn laget `closure_areas`, slå redigering til, og tegn hele området. Geometrien skal gemmes som `MULTIPOLYGON`.

Udfyld:

| Felt | Krav og eksempel |
|---|---|
| `name` | Påkrævet og unikt navn, eksempelvis `LUK-OMR-03 Bøgevej nord`. |
| `description` | Kort forklaring af områdets afgrænsning og formål. |
| `confidence` | Tal fra 0 til 1. Brug eksempelvis `1.0` for verificeret og `0.5` for usikkert. |
| `active` | `true`, når området må bruges til vandlukninger. |

Hvis QGIS opretter en almindelig polygon, konverteres den til multipart-geometri før lagring. Kør **Kontrollér gyldighed** i QGIS og ret overlap, ringfejl eller selvskæringer.

Tegn områderne som små, entydige zoner med samme afspærringsadfærd:

- Naboområder skal som udgangspunkt mødes uden huller eller overlap. Brug snapping og topologisk redigering.
- Tegn ikke et ekstra stort samlepolygon oven på mindre områder for at vise en upstream-afhængighed. Kobl i stedet upstream-hanen til et lukkescenarie på hvert berørt område.
- Opret et separat område, når en delstrækning har andre berørte adresser eller en anden afspærringsadfærd.
- Brug kun flere dele i samme `MULTIPOLYGON`, når delene altid påvirkes af præcis de samme lukkescenarier.
- Polygonoverlap er kun acceptabelt, hvis den faglige virkelighed faktisk har overlappende kundezoner. Det skal dokumenteres i `description` og kontrolleres særskilt.

Lukkeområdets polygon bruges til visning. Listen over berørte adresser kommer derimod fra relationstabellen og beregnes ikke automatisk ud fra, om et adressepunkt ligger inde i polygonen.

## 5. Opret lukkescenarier

Et lukkescenarie er én gyldig lukkehandling. Det kan påvirke flere lukkeområder. **Alle haner i samme scenarie skal være valgt**, før samtlige tilknyttede områder medtages. Flere scenarier, der indeholder samme område, er alternative muligheder.

Eksempel på blindvej med en upstream-hane `H0` og lokale haner `HA` og `HB`:

```text
Område A: scenarie "Upstream" = H0; scenarie "Lokal" = HA
Område B: scenarie "Upstream" = H0; scenarie "Lokal" = HB
```

Eksempel på ringområde, hvor begge ender skal lukkes:

```text
Område R: scenarie "Begge ender" = H1 + H2
Område R: scenarie "Alternativ hovedhane" = H3
```

Administratorer og kortansvarlige vedligeholder scenarier på den selvstændige side **Lukkescenarier** på `/lukkescenarier`:

1. Klik på et lukkeområde i live-kortet for at se alle scenarier, der påvirker det.
2. Vælg et eksisterende scenarie, eller vælg **Nyt scenarie**.
3. Vælg **Tilføj scenarie**, og giv scenariet et entydigt fagligt navn.
4. Markér alle berørte lukkeområder og alle haner, som skal lukkes samtidig. Haner kan vælges i listen eller direkte i live-kortet.
5. Opret et nyt scenarie for hver alternativ afspærringsmulighed.
6. Kontrollér at det valgte område og det aktive scenaries haner er fremhævet i kortet.
7. Gem og gennemfør en prøvevandlukning.

Scenarieeditoren står øverst på siden, mens live-kortet står nedenunder. Det aktive scenaries områder og haner fremhæves. En ringforbindelse modelleres ved at placere alle nødvendige ringhaner i samme scenarie; de forbindes med **OG**. Alternative afspærringer oprettes som separate scenarier; de forbindes indbyrdes med **ELLER**.

Den aktive datamodel består af `closure_scenarios`, `closure_scenario_areas` og `closure_scenario_valves`. Direkte QGIS-redigering er ikke tilladt, fordi et aktivt scenarie altid skal have mindst ét område og én hane. De tidligere tabeller `closure_area_scenarios`, `closure_area_scenario_valves` og `closure_area_valves` er read-only legacy-data.

Opret aldrig et scenarie uden haner eller samme hane to gange i samme scenarie. Brug korte navne som `Upstream ved Skovvej`, `Begge ender` eller `Lokal afspærring`, så operatøren kan forstå beregningen.

## 6. Kobl adresser til lukkeområder

Hver række i `closure_area_addresses` forbinder ét lukkeområde med én adresse.

I Ledningskortet foreslår **Rediger koblinger** de aktive adressepunkter, der ligger i polygonen, og linker videre til den selvstændige scenarieside. Adresseforslagene gemmes først, når brugeren vælger **Gem adresser**. Den geografiske udvælgelse skal stadig gennemgås fagligt.

1. Kontrollér først adressen og lukkeområdet i kortet.
2. Find begge UUID'er i feltet `id`.
3. Åbn tabelvisningen for `closure_area_addresses`.
4. Opret en ny række.
5. Sæt `closure_area_id` til lukkeområdets UUID.
6. Sæt `address_id` til adressens UUID.
7. Lad `deleted_at` være tomt, og gem.

Medtag kun adresser, som forventes berørt. Et adressepunkt inden for polygonen bliver ikke automatisk tilknyttet. Ved mange adresser kan QGIS-værktøjet **Vælg efter placering** bruges til at foreslå kandidater, men resultatet skal gennemgås fagligt, før relationerne oprettes.

En adresse kan være knyttet til flere lukkeområder. Vandlukningsfunktionen samler adresserne og fjerner dubletter, når flere opfyldte scenarier fører til samme adresse.

## 7. Kontrollér resultatet

1. Gem alle QGIS-redigeringer.
2. Genindlæs **Ledningskort** i webapplikationen.
3. Kontrollér at OpenStreetMap-baggrunden vises.
4. Slå lagene til og fra.
5. Søg efter lednings- og hane-ID samt vejnavn.
6. Klik objekterne og kontrollér egenskaberne.
7. Opret en vandlukning som test. Kontrollér både ufuldstændige og komplette scenarier samt hvert alternativ.
8. Sammenlign CSV-eksporten med den fagligt forventede adresseliste.
9. Slet eller aflys testsagen efter kontrollen.

Godkend først dataene til drift, når både kortvisningen og vandlukningsberegningen er kontrolleret.

## Import af mange objekter

Ved import fra CSV, GeoPackage, Shape eller leverandørfil:

1. Importér først til et midlertidigt QGIS-lag.
2. Kontrollér og transformér CRS til EPSG:25832.
3. Ensret feltnavne, typer og kodeværdier.
4. Kontrollér dubletter i `code`, `name` og `external_address_id`.
5. Kør geometrivalidering.
6. Indlæs højst et lille udsnit i produktion først.
7. Kontrollér udsnittet i webkortet, før resten importeres.

Brug aldrig databaseejeren som almindelig QGIS-bruger, og tag altid backup før masseimport.

## Fejlfinding

### Objektet vises ikke på webkortet

- Kontrollér at geometrien er gyldig og gemt i EPSG:25832.
- Kontrollér at `deleted_at` er tomt.
- Kontrollér `active=true` for adresser, ledninger og lukkeområder.
- Kontrollér at `code`, `name` og obligatoriske tekstfelter ikke er tomme.
- Genindlæs siden efter gemte QGIS-ændringer.

### Hanerne giver ingen berørte adresser

- Kontrollér at mindst ét aktivt lukkescenarie er komplet; alle scenariets haner skal være valgt.
- Kontrollér aktive rækker i `closure_scenarios`, `closure_scenario_areas` og `closure_scenario_valves`.
- Kontrollér at lukkeområdet har `active=true` og tomt `deleted_at`.
- Kontrollér aktive rækker i `closure_area_addresses`.
- Kontrollér at adresserne har `active=true` og tomt `deleted_at`.
- Genberegn vandlukningen eller vælg hanerne igen. Eksisterende sager gemmer et øjebliksbillede og ændres ikke automatisk ved senere GIS-rettelser.

### Databasen afviser en række

- Kontrollér unikke koder og områdenavne.
- Kontrollér fire tegn i postnummer.
- Kontrollér tilladte hane-positioner.
- Kontrollér diameter, årstal, risiko og confidence mod de tilladte intervaller.
- Kontrollér om relationen allerede findes med en udfyldt `deleted_at`; genaktivér i så fald den eksisterende række.

## Afsluttende kvalitetskontrol

- Alle objekter har dokumenteret kilde og kvalitet, hvor oplysningerne findes.
- Koder er unikke og stabile.
- Geometrier er gyldige og i EPSG:25832.
- Haner ligger på den forventede ledning.
- Lukkeområder er fagligt verificeret og gemt som multipolygon.
- Naboområder har ingen utilsigtede overlap eller huller.
- Hvert område har testede scenarier for upstream-, lokal- og eventuel ringafspærring.
- Hver aktiv relation forekommer kun én gang.
- Berørte adresser er kontrolleret med en prøvevandlukning.
- Der er taget backup før større ændringer.
