# Planlagte vandlukninger

Fase 4 samler planlægning, afgrænsning og informationsstatus i én vandlukningssag.

## Arbejdsgang

1. Opret vandlukningen under **Vandlukninger** med titel, beskrivelse og tidsrum.
2. Vælg en eller flere haner. Et aktivt lukkeområde medtages, når alle haner i mindst ét af områdets lukkescenarier er valgt.
3. Kontrollér adresselisten og tilføj eller udelad adresser manuelt.
4. Angiv ansvarlig og eventuel entreprenør.
5. Tilknyt eventuelle hændelser. En vandlukning kan have flere hændelser, og samme hændelse kan indgå i flere vandlukninger.
6. Markér adresser som informeret enkeltvis eller samlet.
7. Hent den aktuelle inkluderede adresseliste som semikolonsepareret CSV.
8. Gem den offentlige kladde og vælg **Godkend og offentliggør**. Det sætter samtidig sagen til `planlagt`.
9. Status skifter automatisk til `i gang` ved starttidspunktet og til `afsluttet` ved forventet afslutning. Meddelelsen fjernes samtidig fra `/drift`.

Hvis arbejdet bliver færdigt før tid, ændres **Forventet afsluttet** til det faktiske sluttidspunkt. Gem kladden og vælg **Godkend ny version**; meddelelsen fjernes derefter fra `/drift`. En planlagt vandlukning kan aflyses før start.

## Beregning og historik

Beregningen bruger globale lukkescenarier og relationer mellem lukkeområde og adresse. Alle haner i samme scenarie er et samlet krav; når kravet er opfyldt, medtages alle scenariets områder. Flere scenarier er alternativer. Det understøtter både upstream-haner, ringnet og alternative afspærringer uden overlappende GIS-polygoner. Resultatet gemmes på vandlukningen som et øjebliksbillede. En senere scenarie- eller GIS-rettelse ændrer derfor ikke automatisk en eksisterende sag; brug **genberegn** eller vælg hanerne igen, når resultatet bevidst skal opdateres.

Scenarier vedligeholdes af administratorer og kortansvarlige på `/lukkescenarier`. Klik på et område for at se dets scenarier; vælg derefter et scenarie for at redigere og fremhæve alle dets områder og haner.

Manuelle tilføjelser, udeladelser og informationsstatus bevares ved genberegning. Alle væsentlige ændringer skrives til revisionsloggen.

## Adgang

Administratorer og bestyrelsesmedlemmer kan oprette og ændre vandlukninger. Læsebrugere kan se sagerne og hente CSV, men kan ikke ændre dem. Kun den godkendte offentlige kladde publiceres; interne sagsfelter publiceres ikke automatisk.
