# QGIS

PostGIS er aktiveret, og fase 1-7 gemmer grunddata, driftssager og GIS-relationer. Kortgeometri lagres i EPSG:25832. Følgende read-only-views er tilgængelige:

Den praktiske administratorvejledning findes i `docs/admin-map-guide.md`.

- `qgis_active_valves`
- `qgis_active_pipes`
- `qgis_incidents`
- `qgis_map_corrections`

Opret databasebrugeren manuelt med en unik adgangskode, så ingen QGIS-hemmelighed gemmes i Git:

```sql
CREATE ROLE qgis_editor LOGIN PASSWORD '<unik adgangskode>';
GRANT CONNECT ON DATABASE gavadr TO qgis_editor;
GRANT USAGE ON SCHEMA public TO qgis_editor;
GRANT SELECT ON qgis_active_valves, qgis_active_pipes, qgis_incidents, qgis_map_corrections TO qgis_editor;
GRANT SELECT, INSERT, UPDATE ON addresses, valves, pipes, closure_areas, closure_area_addresses TO qgis_editor;
GRANT SELECT ON closure_scenarios, closure_scenario_areas, closure_scenario_valves TO qgis_editor;
```

Brug views til almindelig visning. Direkte tabelredigering gives kun til den kortansvarlige og logges i MVP'en via `updated_at`/`updated_by`; et fuldt database-triggerbaseret revisionsspor for QGIS er en kendt begrænsning.

## Ledningstyper og signatur

Alle ledninger ligger i samme tabel, men `pipe_type` skelner mellem de tre typer:

| Værdi i databasen | Vises som |
|---|---|
| `main` | Hovedforsyningsledning |
| `distribution` | Fordelingsledning |
| `service` | Stikledning |

Brug `docs/qgis-pipes.qml` for at gøre typerne tydelige og undgå fritekst i QGIS:

1. Højreklik på laget `pipes` eller `qgis_active_pipes`, og vælg **Egenskaber**.
2. Vælg **Symbologi**, klik **Stil** nederst, og vælg **Indlæs stil**.
3. Vælg `docs/qgis-pipes.qml`, indlæs stilen, og gem QGIS-projektet.
4. Ved redigering af `pipes` vælger du nu **Hovedforsyningsledning**, **Fordelingsledning** eller **Stikledning** i formularen. QGIS gemmer automatisk `main`, `distribution` eller `service`.

Stilen viser hovedforsyningsledninger som kraftige blå linjer, fordelingsledninger som orange linjer og stikledninger som tyndere turkise, stiplede linjer. Webappens tre kortlag bruger de samme værdier og kan slås til og fra hver for sig. Hvis en eksisterende ledning ikke vises i en af kategorierne, skal dens `pipe_type` rettes til en af værdierne ovenfor; opret ikke nye varianter.

Lukkescenarier redigeres kun på `/lukkescenarier`, hvor scenarieregistret og live-kortet validerer mindst ét område og én hane og skriver auditlog. Den globale model ligger i `closure_scenarios`, `closure_scenario_areas` og `closure_scenario_valves`. Tidligere scenario- og haneområderelationer er read-only legacy-data efter migration `20260811_0013`.

QGIS må kun forbinde via lokalt netværk eller VPN. Produktionsdatabasen må aldrig eksponeres gennem Cloudflare Tunnel eller en offentlig port. Brug `scripts/create_qgis_user.sh` frem for applikationens databaseejer. Det interne koordinatsystem er EPSG:25832; web-API'et leverer GeoJSON i EPSG:4326, som MapLibre viser i Web Mercator.

Kendte begrænsninger: QGIS-tabellerne har constraints og tidsstempler, men direkte ændringer har ikke samme komplette applikationsaudit som webændringer. Undgå samtidige ændringer af samme objekt, tag backup før masseimport, og validér altid lagets CRS og geometri før commit.
