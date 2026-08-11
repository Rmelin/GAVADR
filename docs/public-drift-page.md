# Offentlig driftsinformation

Den offentlige driftsstatus findes på:

```text
https://<vandværkets-domæne>/drift
```

Siden kræver ikke login. Vandlukninger vises først, når en administrator eller et bestyrelsesmedlem har godkendt og offentliggjort teksten. Godkendelsen sætter samtidig vandlukningen til **Planlagt**.

En planlagt vandlukning markeres som **Aktiv vandlukning**, når det aktuelle tidspunkt ligger mellem start og forventet afslutning. Ved sluttidspunktet fjernes meddelelsen automatisk.

## Indlejr siden

Brug `embed=1` for at skjule sidens eget top- og bundområde ved indlejring:

```html
<iframe
  src="https://<vandværkets-domæne>/drift?embed=1"
  title="Aktuel driftsinformation fra GAVAD Vandværk"
  loading="lazy"
  style="width:100%;min-height:620px;border:0"
></iframe>
```

Indlejringen er responsiv. Justér `min-height` til værtswebsidens layout. Ved mange aktive meddelelser kan en større højde være nødvendig.

## Direkte dataadgang

Offentlige hjemmesider kan alternativt hente JSON-feedet fra:

```text
https://<vandværkets-domæne>/api/public/driftsstatus
```

API'et tillader CORS fra alle origins og caches i højst 60 sekunder. Den kompatible JSON-adresse `/public/driftsstatus.json` bruger samme dynamiske feed og kan derfor ikke fastholde en udløbet vandlukning.

## Offentliggør en meddelelse

1. Åbn den relevante hændelse eller vandlukning i driftssystemet.
2. Find **Offentlig driftsstatus**.
3. Ret overskrift, offentlig besked, områder og tidsrum. **Forventet afsluttet** er obligatorisk for vandlukninger.
4. Kontrollér **Præcis offentlig forhåndsvisning**.
5. Gem kladden.
6. Vælg **Godkend og offentliggør**, og bekræft at teksten ikke indeholder personoplysninger eller intern information.

Bliver en vandlukning færdig før tid, rettes **Forventet afsluttet** til det faktiske sluttidspunkt. Gem kladden og vælg **Godkend ny version**. Meddelelsen forsvinder derefter fra `/drift`.

Overblik viser den samme offentlige komponent som `/drift`, så medarbejdere hurtigt kan kontrollere, om siden viser normal drift, planlagt arbejde, vandlukning eller en driftsforstyrrelse.
