# Privacy en beveiliging

ZIB verwerkt financiële gegevens van ondernemers. Dat zijn persoonsgegevens in de zin van de AVG, en voor een bank of adviesorganisatie gelden daarnaast interne regels voor informatiebeveiliging en uitbesteding.

## Spelregels

1. **Gebruik echte klantgegevens alleen in een goedgekeurde omgeving.** Een persoonlijk GitHub- of Cloudflare-account is dat in de regel niet. Laat je werkgever (privacy officer en IT) bepalen waar ZIB mag draaien. Tot die tijd: demodossiers en fictieve gegevens.
2. **Geen BSN, rekeningnummers of kopieën van legitimatiebewijzen.** Voor de inkomensbepaling zijn ze niet nodig; ZIB vraagt er ook niet om.
3. **Back-ups horen niet in Git.** `.gitignore` sluit `zib-backup-*.json` en `backups/` uit. Bewaar exports versleuteld op een goedgekeurde locatie en verwijder ze als ze niet meer nodig zijn.
4. **Repository privé** zodra er interne beleidsteksten of werkinstructies in komen. De rekenregels in deze code zijn eigen samenvattingen met verwijzingen naar regelnummers.
5. **Geen schermafdrukken of notities uit echte dossiers in de repository.** Schermen uit de rekentool van de bank, dossiernotities en organogrammen bevatten namen, geboortedata, KvK- en leningnummers. Gebruik ze alleen als voorbeeld voor de opbouw en vervang ze door fictieve gegevens (zoals de demodossiers). Ook de afbeeldingen in `docs/img` komen uit de demodossiers.
6. **Cloudflare Access verplicht** voor de cloudversie. Zonder `ACCESS_TEAM_DOMAIN` en `ACCESS_AUD` weigert de API elk verzoek. `DEV_ALLOW_ANON` alleen lokaal.
7. **EU-opslag**: maak de D1-database en de R2-bucket aan met `--jurisdiction=eu`.

## Wat ZIB technisch doet

- Alle API-verzoeken worden gecontroleerd op een geldige, ondertekende Access-token (RS256, audience, uitgever, vervaldatum).
- Elke wijziging wordt met gebruiker en tijdstip vastgelegd (`audit`), de vorige versie blijft bewaard (`record_versions`).
- Verwijderen is zacht; herstel is mogelijk via de versiegeschiedenis.
- Beveiligingsheaders via `public/_headers`: Content-Security-Policy, geen framing, geen referrer, `noindex`.
- Geen tracking, geen analytics, geen externe scripts. Alleen het lettertype wordt van Google Fonts geladen; wil je ook dat niet, verwijder dan de twee `fonts.googleapis.com`-regels uit `index.html` (de app valt terug op een systeemlettertype).

## Bewaartermijnen

Spreek een bewaartermijn af (bijvoorbeeld conform het dossierbeleid van de geldverstrekker) en verwijder afgeronde dossiers en documenten daarna. Verwijderen in ZIB is zacht; definitief verwijderen doe je met een gerichte SQL-opdracht op D1 (`DELETE FROM records WHERE ...` en `DELETE FROM record_versions WHERE ...`) en het verwijderen van de bijbehorende objecten in R2.
