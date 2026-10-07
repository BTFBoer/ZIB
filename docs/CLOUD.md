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

## Stap voor stap: Cloudflare

Benodigd: een (gratis) Cloudflare-account, Node.js 20+ en de repository op GitHub.

### 1. Inloggen met Wrangler

```bash
npx wrangler login
```

### 2. Database aanmaken (EU)

```bash
npx wrangler d1 create zib --jurisdiction=eu
```

Kopieer het getoonde `database_id` naar `wrangler.toml` (regel `database_id = ...`). De jurisdictie kun je achteraf niet wijzigen. Zet daarna het schema in de database:

```bash
npm run db:migrate:remote
```

### 3. Bestandsopslag aanmaken (optioneel, voor uploads)

```bash
npx wrangler r2 bucket create zib-documenten --jurisdiction=eu
```

Cloudflare kan bij het activeren van R2 om een betaalmethode vragen. Zonder R2 werkt alles behalve het uploaden van documenten.

### 4. Pages-project koppelen aan GitHub

1. Cloudflare-dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Kies `BTFBoer/ZIB`, branch `main`.
3. Build command: leeg laten. Build output directory: `public`.
4. Deploy. Pages leest de bindings (`DB`, `FILES`) uit `wrangler.toml`. Zie je ze niet onder **Settings → Bindings**, voeg ze daar dan handmatig toe: D1 database `zib` als `DB`, R2 bucket `zib-documenten` als `FILES`.

Elke push naar `main` publiceert automatisch een nieuwe versie.

### 5. Afschermen met Cloudflare Access

1. Open **Zero Trust** in het dashboard en kies een teamnaam (bijvoorbeeld `jouwteam`). Het teamdomein wordt `jouwteam.cloudflareaccess.com`.
2. **Access → Applications → Add an application → Self-hosted**.
3. Domein: het adres van je Pages-project (bijvoorbeeld `zib.pages.dev`) of je eigen domein. Voeg ook `*.zib.pages.dev` toe zodat previewversies afgeschermd zijn.
4. Policy: **Allow**, Include → **Emails** → jouw e-mailadres (en dat van collega's).
5. Opslaan en de **Application Audience (AUD) Tag** kopiëren.
6. In het Pages-project: **Settings → Variables and Secrets**, voor Production én Preview:
   - `ACCESS_TEAM_DOMAIN` = `jouwteam.cloudflareaccess.com`
   - `ACCESS_AUD` = de AUD-tag
7. Opnieuw deployen.

De API controleert bij elk verzoek de ondertekende Access-token (handtekening, AUD, uitgever, vervaldatum). Zonder deze twee variabelen weigert de API alle verzoeken.

### 6. Controleren

Open de site, log in via Access (e-mailcode). Rechtsboven staat **Cloud** in plaats van **Lokaal**. Onder Mijn gegevens zie je met welk account je bent ingelogd. `https://<jouw-site>/api/health` toont of database, bestanden en Access gekoppeld zijn.

### 7. Lokale gegevens meenemen

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
