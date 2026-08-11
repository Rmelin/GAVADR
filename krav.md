# Kravspecifikation – Drift af vandværkets ledningsnet

## 1. Formål

Der skal udvikles en moderne webapplikation til bestyrelsen i et mindre vandværk med cirka 10 brugere.

Applikationen skal hjælpe bestyrelsen med at:

- drifte og prioritere ledningsnettet
- registrere og håndtere ledningsbrud
- planlægge lukning af vandet
- identificere berørte adresser
- informere bestyrelse og forbrugere
- registrere henvendelser fra beboere
- følge op på kortfejl og leverandørrettelser
- offentliggøre driftsstatus på vandværkets statiske hjemmeside

Løsningen skal være nem at bruge for personer uden GIS-erfaring.

## 2. Centrale brugerroller

### Administrator

Kan:

- oprette og deaktivere brugere
- tildele roller
- konfigurere systemet
- konfigurere notifikationer og integrationer
- se revisionslog

### Bestyrelsesmedlem

Kan:

- se kort og ledningsnet
- registrere hændelser og henvendelser
- oprette planlagte vandlukninger
- vælge haner på kortet
- se berørte adresser
- opdatere driftsstatus
- modtage notifikationer
- følge op på opgaver

### Kortansvarlig

Kan:

- registrere forslag til kortrettelser
- rette udvalgte data
- sende rettelser til kortleverandør
- følge op på leverandørens arbejde
- kontrollere gennemførte rettelser
- anvende QGIS mod PostGIS

### Læsebruger

Kan se data, men ikke ændre dem.

## 3. Vigtigste arbejdsgange

### 3.1 Akut ledningsbrud

Brugeren skal kunne:

1. registrere en melding om brud
2. angive placering på kortet
3. tilføje beskrivelse og billeder
4. angive prioritet
5. sende notifikation til bestyrelsen
6. tildele en ansvarlig
7. vælge de haner, der skal lukkes
8. få vist forventede berørte adresser
9. rette adresselisten manuelt
10. registrere kontakt til VVS eller gravefirma
11. offentliggøre driftsstatus
12. opdatere hændelsen løbende
13. registrere, hvornår vandet åbnes igen
14. afslutte hændelsen og gemme læring

Systemet skal vise, hvilke trin der er gennemført.

### 3.2 Planlagt vandlukning

Brugeren skal kunne:

- angive dato og tidsrum
- beskrive arbejdet
- vælge haner
- få vist berørte adresser
- registrere entreprenør og ansvarlig
- oprette kommunikationsplan
- markere, hvilke adresser der er informeret
- publicere en driftsmeddelelse
- afslutte eller aflyse lukningen

### 3.3 Beboerhenvendelser

Brugeren skal kunne registrere:

- navn og kontaktoplysninger
- adresse
- tidspunkt og kanal
- kategori
- beskrivelse
- prioritet
- ansvarlig
- opfølgningsdato
- status
- noter og bilag

En henvendelse skal kunne kobles til:

- en adresse
- en hændelse
- et kortobjekt
- en opgave
- en kortrettelse

### 3.4 Kortrettelser

Brugeren skal kunne registrere:

- forkert placering af hane
- manglende hane
- forkert ledningsføring
- manglende stikledning
- forkert lukkeområde
- andre fejl i kortet

En kortrettelse skal kunne følge denne proces:

1. ny
2. undersøges
3. klar til leverandør
4. sendt til leverandør
5. afventer leverandør
6. rettet af leverandør
7. klar til kontrol
8. godkendt
9. afsluttet

## 4. Kort og ledningsnet

Kortet skal kunne vise:

- ledninger
- hovedledninger
- stikledninger
- haner
- hovedstophaner
- målerbrønde
- adresser
- lukkeområder
- brud
- planlagte arbejder
- henvendelser
- kortrettelser

Lag skal kunne slås til og fra.

Brugeren skal kunne søge efter:

- adresse
- vejnavn
- hane-ID
- lednings-ID
- hændelsesnummer
- henvendelsesnummer

## 5. Haner og berørte adresser

Ved en hændelse eller vandlukning skal brugeren kunne:

1. vælge en eller flere haner på kortet
2. se tilknyttede lukkeområder
3. se berørte adresser
4. tilføje eller fjerne adresser manuelt
5. gemme resultatet på sagen
6. eksportere adresselisten som CSV

I MVP'en må beregningen baseres på foruddefinerede lukkeområder.

Automatisk netværksanalyse skal kunne tilføjes senere.

## 6. Hændelser

En hændelse kan være:

- mistanke om brud
- bekræftet brud
- trykfald
- manglende vand
- misfarvet vand
- planlagt arbejde
- defekt hane
- kortfejl
- anden driftsforstyrrelse

En hændelse skal mindst have:

- nummer
- titel
- beskrivelse
- type
- prioritet
- status
- placering
- registreringstidspunkt
- ansvarlig
- billeder
- valgte haner
- berørte adresser
- forventet afslutning
- offentlig tekst
- intern historik

## 7. Notifikationer

MVP'en skal kunne sende e-mailnotifikation til bestyrelsen.

Notifikationen skal indeholde:

- hændelsestype
- prioritet
- placering
- tidspunkt
- registreret af
- link til hændelsen

Senere skal systemet kunne udvides med:

- push-notifikationer
- SMS
- Teams
- webhook
- andre beskedtjenester

## 8. Driftsstatus på offentlig hjemmeside

Vandværkets hjemmeside er statisk.

Webapplikationen skal derfor kunne levere offentlig driftsstatus gennem:

- et read-only API
- og/eller en genereret JSON-fil

Eksempel:

```http
GET /api/public/driftsstatus
```

Kun oplysninger, som aktivt er markeret som offentlige, må vises.

Det offentlige output må ikke indeholde:

- personoplysninger
- interne kommentarer
- præcise følsomme infrastrukturopslysninger
- interne kontaktoplysninger

En intern hændelse må ikke offentliggøres automatisk.

## 9. Opgaver og opfølgning

Hændelser, henvendelser og kortrettelser skal kunne oprette opgaver.

En opgave skal have:

- titel
- beskrivelse
- ansvarlig
- prioritet
- status
- frist
- relation til sag eller kortobjekt
- kommentarer

Dashboardet skal vise:

- mine åbne opgaver
- kritiske opgaver
- overskredne opgaver
- opgaver uden ansvarlig

## 10. Prioritering af ledningsnettet

Ledninger og andre objekter skal kunne risikovurderes ud fra:

- alder
- materiale
- tidligere brud
- konsekvens ved brud
- antal berørte adresser
- kritiske forbrugere
- tilstand
- usikkerhed i kortdata
- reparationshistorik

MVP'en kan anvende:

```text
Risiko = sandsynlighed × konsekvens
```

Begge værdier vurderes fra 1 til 5.

## 11. Dashboard

Forsiden skal vise:

- aktive driftsforstyrrelser
- planlagte vandlukninger
- nye henvendelser
- åbne kortrettelser
- kritiske opgaver
- overskredne opgaver
- seneste aktiviteter
- kort med aktuelle hændelser

Der skal være en tydelig hurtigknap til:

- Registrer brud
- Opret vandlukning
- Registrer henvendelse

## 12. Brugergrænseflade

Brugergrænsefladen skal:

- være på dansk
- være responsiv
- fungere på desktop, tablet og mobil
- have dark mode som standard
- tilbyde lys tilstand
- have tydelige statusmarkeringer
- have store trykflader på mobil
- kræve bekræftelse ved kritiske handlinger

## 13. Persondata

Systemet kan indeholde personoplysninger.

Derfor skal løsningen understøtte:

- rollebaseret adgang
- revisionslog
- dataminimering
- sletning eller anonymisering
- eksport af registrerede oplysninger
- opbevaringsperioder

Personoplysninger må aldrig indgå i offentlige API-svar.

## 14. MVP

MVP'en skal indeholde:

### Grundsystem

- login
- roller
- Docker Compose
- PostgreSQL med PostGIS
- Cloudflare Tunnel
- revisionslog
- backup og restore

### Kort

- OpenStreetMap
- haner
- ledninger
- adresser
- lukkeområder
- hændelser
- lagstyring
- søgning

### Hændelser

- registrering af brud
- kortplacering
- billeder
- status
- ansvarlig
- historik
- kommentarer
- e-mailnotifikation

### Vandlukning

- valg af haner
- lukkeområder
- berørte adresser
- manuel korrektion
- CSV-eksport
- informationsstatus

### Henvendelser

- registrering
- ansvarlig
- opfølgningsdato
- status
- kobling til adresse og hændelse

### Kortrettelser

- registrering
- placering
- billeder
- leverandørstatus
- kontrol og afslutning

### Offentlig driftsstatus

- offentlig tekst
- aktiv godkendelse
- read-only API
- JSON-output
- afslutning af driftsmeddelelse

## 15. Acceptkriterier

MVP'en kan godkendes, når følgende kan gennemføres:

1. En bruger logger ind.
2. Brugeren registrerer et muligt brud.
3. Placeringen markeres på kortet.
4. Et billede og en beskrivelse tilføjes.
5. Bestyrelsen modtager en notifikation.
6. En ansvarlig tilknyttes.
7. Relevante haner vælges.
8. Berørte adresser vises.
9. Adresselisten rettes og eksporteres.
10. En offentlig driftsmeddelelse oprettes.
11. Driftsstatus kan hentes via API.
12. Hændelsen opdateres løbende.
13. Vandet registreres som åbnet igen.
14. Driftsmeddelelsen afsluttes.
15. Hele historikken kan ses.

Et andet godkendelsesscenarie er:

1. En beboer melder en kortfejl.
2. Henvendelsen registreres.
3. Der oprettes en kortrettelse.
4. Rettelsen sendes til leverandøren.
5. Leverandørens rettelse registreres.
6. Rettelsen kontrolleres.
7. Sagen afsluttes.
