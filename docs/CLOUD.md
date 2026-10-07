# Cloudopslag: zo raak je geen gegevens kwijt

ZIB draait zonder server als statische website. Dan staan dossiers alleen in de browser (localStorage en IndexedDB): handig voor een demo, maar kwetsbaar. Browsergegevens wissen, een ander apparaat of een kapotte laptop betekent dat alles weg is. Voor echt gebruik koppel je daarom een centrale opslag.

## Welke cloud?

| Criterium | Cloudflare Pages + D1 + R2 + Access (aanbevolen) | Supabase (Postgres) | GitHub Pages + browseropslag |
|---|---|---|---|
| Bescherming tegen dataverlies | Point-in-time-herstel (Time Travel) 7 dagen gratis, 30 dagen op Workers Paid; plus versiegeschiedenis per record in ZIB | Dagelijkse back-ups pas vanaf Pro (circa $25/maand); gratis projecten pauzeren na een week inactiviteit | Geen: alles staat in één browser |
| Gegevenslocatie | Database en bestanden met EU-jurisdictie (instelbaar bij aanmaken) | EU-regio te kiezen | Lokaal op het apparaat |
| Inloggen | Cloudflare Access voor de hele site (gratis tot 50 gebruikers), met e-mailcode of SSO | Eigen login inbouwen (Supabase Auth) | Geen |
| Privérepository | Kan vanuit een privérepository publiceren | n.v.t. | Pages vanuit privérepo vereist GitHub Pro, en de site blijft dan toch publiek |
| Werk voor jou | Eén platform, deze repository bevat alle code | Extra SDK, beleid (RLS) en login bouwen | Geen |

ZIB bevat de code voor de Cloudflare-route volledig: de API (`functions/`), het databaseschema (`migrations/`) en de configuratie (`wrangler.toml`).

> Werk je met echte klantgegevens voor een bank of andere werkgever, dan beslist die werkgever waar de gegevens mogen staan. Een persoonlijk Cloudflare- of GitHub-account is daar in de regel niet voor goedgekeurd. Gebruik deze route dan voor testen met fictieve dossiers, en vraag IT/privacy naar een goedgekeurde omgeving (bijvoorbeeld de eigen Azure-tenant van de werkgever). Zie ook [PRIVACY.md](PRIVACY.md).

## Google Drive (demo op claude.ai)

De demo op claude.ai kan dossiers bewaren in je eigen Google Drive, via de Google Drive-koppeling van claude.ai. Op de pagina Downloads kies je **Google Drive koppelen** en sta je de koppeling toe.

- ZIB maakt de map `ZIB` en zet daar bij elke opslag een nieuw bestand `ZIB-gegevens <tijd>.json` neer. De koppeling kan een bestaand bestand niet overschrijven; daarom zijn het versies. De tien nieuwste blijven staan, oudere gaan naar de prullenbak (30 dagen terug te halen).
- Na een wijziging slaat ZIB binnen ongeveer twintig seconden op. Bij het openen haalt ZIB de nieuwste versie op en voegt die samen met wat in de browser staat: per dossier wint de nieuwste wijziging, ook een verwijdering.
- Geüploade documenten (pdf's) gaan niet mee; die blijven in de browser.
- Werk je op twee apparaten tegelijk aan hetzelfde dossier, dan wint de laatste opslag. Gebruik het als persoonlijke opslag voor één gebruiker.
- Alleen voor fictieve of geanonimiseerde dossiers: een persoonlijke Google Drive is geen goedgekeurde plek voor klantgegevens.

## Stap voor stap: Cloudflare

Benodigd: een (gratis) Cloudflare-account en de repository op GitHub. Alles kan in het Cloudflare-dashboard; de opdrachtregel (Node.js 20+, `npx wrangler login`) is een alternatief.

### 1. Database aanmaken (EU)

Dashboard → **Storage & Databases → D1 → Create**: naam `zib`, locatie met jurisdictie **EU** (achteraf niet te wijzigen). Open daarna de database → **Console** en plak de inhoud van `migrations/0001_init.sql` om de tabellen aan te maken.

Zet het **Database ID** in `wrangler.toml` (regel `database_id = ...`) en commit dat. Via de opdrachtregel kan het ook:

```bash
npx wrangler d1 create zib --jurisdiction=eu
npm run db:migrate:remote
```

### 2. Bestandsopslag aanmaken (optioneel, voor uploads)

Dashboard → **R2 → Create bucket**: naam `zib-documenten`, jurisdictie **EU** (of `npx wrangler r2 bucket create zib-documenten --jurisdiction=eu`). Cloudflare kan bij het activeren van R2 om een betaalmethode vragen. Sla je R2 over, verwijder dan het blok `[[r2_buckets]]` uit `wrangler.toml`; alles werkt dan behalve het uploaden van documenten.

### 3. Pages-project koppelen aan GitHub

1. Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Geef de Cloudflare-app op GitHub toegang tot `BTFBoer/ZIB` (ook als de repository privé is) en kies branch `main`.
3. Build command: leeg laten. Build output directory: `public`.
4. Deploy. Pages leest de koppelingen met de database (`DB`) en de bestandsopslag (`FILES`) uit `wrangler.toml`; dat bestand is de bron van waarheid, dus die velden zie je in het dashboard alleen-lezen.

Elke push naar `main` publiceert automatisch een nieuwe versie. Het adres wordt `https://<projectnaam>.pages.dev`; een eigen domein koppel je onder **Custom domains**.

### 4. Inloggen met je e-mailadres (Cloudflare Access)

1. Open **Zero Trust** in het dashboard en kies een teamnaam (bijvoorbeeld `jouwteam`). Het teamdomein wordt `jouwteam.cloudflareaccess.com`.
2. **Settings → Authentication → Login methods**: controleer dat **One-time PIN** aanstaat. Je logt dan in met een code die naar je e-mailadres wordt gestuurd; een wachtwoord is niet nodig.
3. **Access → Applications → Add an application → Self-hosted**. Domein: het adres van je Pages-project (bijvoorbeeld `zib.pages.dev`) of je eigen domein. Voeg ook `*.zib.pages.dev` toe zodat previewversies afgeschermd zijn. Sessieduur bijvoorbeeld 24 uur.
4. Policy: **Allow**, Include → **Emails** → jouw e-mailadres (en eventueel dat van collega's). Andere adressen komen er niet in.
5. Opslaan en de **Application Audience (AUD) Tag** kopiëren.
6. In het Pages-project: **Settings → Variables and Secrets → Add**, kies **Encrypt**, voor Production én Preview:
   - `ACCESS_TEAM_DOMAIN` = `jouwteam.cloudflareaccess.com`
   - `ACCESS_AUD` = de AUD-tag
   - `ALLOWED_EMAILS` = hetzelfde e-mailadres (meerdere komma-gescheiden). Dit is een tweede slot in de API: ook als de Access-policy per ongeluk ruimer staat, komen alleen deze adressen bij de gegevens.
7. Opnieuw deployen (Deployments → laatste deployment → **Retry deployment**, of een nieuwe push).

De API controleert bij elk verzoek de ondertekende Access-token (handtekening, AUD, uitgever, vervaldatum) en daarna de lijst `ALLOWED_EMAILS`. Zonder `ACCESS_TEAM_DOMAIN` en `ACCESS_AUD` weigert de API alle verzoeken.

### 5. Controleren

Open de site: je krijgt de inlogpagina van Cloudflare, vult je e-mailadres in en daarna de code uit de mail. Rechtsboven staat **Cloud** in plaats van **Lokaal**, en onder Mijn gegevens zie je met welk adres je bent ingelogd. `https://<jouw-site>/api/health` toont of database, bestanden, Access en de lijst met adressen zijn ingesteld.

### 6. Lokale gegevens meenemen

In de lokale versie: **Downloads → Back-up downloaden**. In de cloudversie: **Downloads → Back-up terugzetten**. Geüploade pdf's zitten niet in de JSON; upload die opnieuw.

## Back-ups en herstel

ZIB beschermt gegevens in drie lagen:

1. **Versiegeschiedenis per record.** Elke wijziging bewaart de vorige versie in `record_versions`. In een dossier: Fiattering → *Eerdere versies van dit dossier* → terugzetten. Verwijderen is zacht: het record blijft herstelbaar.
2. **Conflictdetectie.** Wijzigen twee mensen tegelijk hetzelfde dossier, dan krijgt de tweede een melding en kiest welke versie blijft. Er wordt niets stil overschreven.
3. **Point-in-time-herstel van de hele database** (D1 Time Travel):

```bash
npx wrangler d1 time-travel info zib --timestamp=2026-10-01T09:00:00Z
npx wrangler d1 time-travel restore zib --timestamp=2026-10-01T09:00:00Z
```

Op het gratis plan gaat dit 7 dagen terug, op Workers Paid ($5/maand) 30 dagen. Voor langere bewaring maak je periodiek een export en bewaar je die op een goedgekeurde, versleutelde locatie (nooit in Git):

```bash
npx wrangler d1 export zib --remote --output=zib-backup.sql
```

## Kosten (indicatie)

Voor één acceptant of een klein team blijft dit doorgaans binnen de gratis limieten: D1 (op het gratis plan 500 MB per database en 5 GB per account; een dossier is enkele tientallen kilobytes, dus ruim voldoende voor duizenden dossiers), Pages (statische site), Functions (valt onder de Workers-limiet van 100.000 verzoeken per dag), Access (tot 50 gebruikers) en R2 (10 GB). Wil je 30 dagen herstel in plaats van 7, neem dan Workers Paid. Controleer de actuele limieten op de prijspagina's van Cloudflare.

## Lokaal ontwikkelen met de API

```bash
cp .dev.vars.example .dev.vars       # zet DEV_ALLOW_ANON=1 (alleen lokaal!)
npm run db:migrate:local
npm run dev:cloud                    # http://localhost:8788
```

`DEV_ALLOW_ANON` laat de API zonder Access werken. Zet deze variabele nooit in het Pages-project.
