// Sjablonen voor de dossieraantekeningen. In eigen woorden opgesteld; vervang of verfijn ze
// met de formats van je eigen organisatie (houd interne werkinstructies buiten een publieke repository).

export const FORMATS = {
  algemeen: `Wie is de klant?
- Omschrijving:
- Leeftijd:
- Ondernemer sinds:

Organisatiestructuur
- Organogram en rechtsvormen:
- Samenhang tussen de ondernemingen:
- Datum oprichting:
- Historie (wijzigingen in structuur, activiteiten of verdienmodel):

Kernactiviteiten
- Branche:
- Uit welke onderneming(en) komt het inkomen:
- Activiteiten per onderneming in eigen woorden (eventueel aangevuld met de website):

Bijzonderheden
- Toelichting adviseur / aanvrager:
- Overig:`,

  financieelOnderneming: `Winst- en verliesrekening
- Omzet- en resultaatontwikkeling en herkomst van de omzet:
- Past de kostenstructuur bij het verdienmodel:
- Bijzondere baten/lasten, cashflow- en andere correcties (wel of niet gecorrigeerd, en waarom):

Balans
- Doorgevoerde balanscorrecties (cijfermatig) en motivering van afwijkingen:
- Ratio's en ontwikkeling over de beschikbare jaren:
- Balansmutaties, omloopsnelheden en investeringsbehoefte:
- Gestelde zekerheden en de impact op het toetsinkomen of de hypotheek:

Onttrekbaarheid
- Geldstromen binnen de structuur (loon DGA, managementfee, intern dividend):
- Kan het inkomen vast en bestendig uit de onderneming worden onttrokken:`,

  kredietbestemming: `- Achtergrond (starter, doorstromer, bestaande klant, meeneemregeling):
- Waarvoor is de aanvraag bestemd:`,

  conclusieBerekend: `Berekend inkomen
- Waarom dit inkomen bestendig is:
- Meegenomen componenten en waarom:
- Toegepaste correcties:
- Gebruikte jaarcijfers (definitief, voorlopig, prognose):`,

  conclusieAfwijkend: `Afwijkend inkomen
- Motivatie voor de afwijking:
- Vaststelling van het afwijkende inkomen:
- Volledig uitgeschreven rekenkundige onderbouwing:
- Bestendigheid van het afwijkende inkomen:
- Onderliggende documentatie voor de afwijking:`,

  conclusieGeen: `Geen inkomen afgegeven
- Motivatie:
- Onderbouwing:`,

  conclusieNul: `0-inkomen
- Akkoord: waarom het 0-inkomen kan worden afgegeven:
- Niet akkoord: op basis van welke risico's de hypotheek niet op het loondienstinkomen kan worden verstrekt:`,

  bijlagen: `- Conclusie over de aangeleverde boekhoudgegevens:
- Afwijkingen van de vormvereisten (welke):
- Jaarcijfers (jaren) waarop de analyse is gebaseerd:
- Aanwezige IB-aangiften (jaren):
- Onregelmatigheden in de stukken (bijv. aangiften kort na elkaar ingediend):
- Stukkenlijst (alle gebruikte documenten):`,

  prive: `Conform aangifte IB (jaar):
Eigen woning (adres):
WOZ-waarde: €
Eigenwoningschuld: €  (geldverstrekker: )
Box 3 (bezittingen en peildatum): €
Overige schulden: €
BKR (zakelijk en privé):
Maandlasten in privé (R/C directie, lening directie, zakelijk krediet):`,
};

// Notitievelden van de dossierschil in BZI-stijl (rechterpaneel), met het bijbehorende format.
export const NOTITIE_VELDEN = [
  ['algemeen', 'Algemene informatie + organogram', 'algemeen'],
  ['financieel', 'Financiële informatie onderneming', 'financieelOnderneming'],
  ['priveTekst', 'Financiële informatie ondernemer in privé', 'prive'],
  ['kredietbestemming', 'Kredietbestemming / aflossing', 'kredietbestemming'],
  ['conclusie', 'Conclusie', null],
  ['bijlagen', 'Bijlagen', 'bijlagen'],
];

/** Kies het conclusieformat dat past bij de uitkomst. */
export function conclusieFormat(d, r) {
  if (d.soort === 'NUL') return 'conclusieNul';
  if (d.afwijkend?.actief || r?.bron === 'afwijkend') return 'conclusieAfwijkend';
  if (r?.bron === 'geen') return 'conclusieGeen';
  if (r?.bron === 'nul') return 'conclusieNul';
  return 'conclusieBerekend';
}

/** Zet de oude, gestructureerde privévelden om naar de tekstvorm. */
export function priveAlsTekst(p = {}) {
  const eur = (x) => (x === undefined || x === null || x === '' ? '' : `€ ${new Intl.NumberFormat('nl-NL').format(Number(x) || 0)}`);
  return [
    `Conform aangifte IB (jaar): ${p.jaar || ''}`,
    `Eigen woning (adres): ${p.adres || ''}`,
    `WOZ-waarde: ${eur(p.woz)}`,
    `Eigenwoningschuld: ${eur(p.ews)}${p.ewsBij ? `  (geldverstrekker: ${p.ewsBij})` : ''}`,
    `Box 3 (bezittingen en peildatum): ${eur(p.bezittingen)}${p.peildatum ? ` per ${String(p.peildatum).split('-').reverse().join('-')}` : ''}`,
    `Overige schulden: ${eur(p.overigeSchulden)}`,
    `BKR (zakelijk en privé): ${p.bkr || ''}`,
    `Maandlasten in privé (R/C directie, lening directie, zakelijk krediet): ${p.rcMaandlast ? eur(p.rcMaandlast) : ''}`,
  ].join('\n');
}

export const CONTROLES = [
  ['aflos', 'Aflosverplichtingen ingevoerd?'],
  ['ubo', 'UBO-uittreksel in dossier?'],
  ['big', 'Zorg/vrij beroep: beroepsregister gecontroleerd?'],
  ['lrk', 'Kinderopvang/gastouder: LRK gecontroleerd?'],
  ['google', 'Google check (KYC) in dossier?'],
  ['kvk', 'KvK-check (adres en inschrijvingen) in dossier?'],
  ['boekhouder', 'Boekhouder/accountant toegevoegd?'],
  ['sfh', 'Fraudetoets (SFH) uitgevoerd?'],
];

export const FIAT_VRAGEN = [
  ['structuur', 'Zijn alle ondernemingen (organogram, KvK, deelnemingen) in beeld en vastgelegd?'],
  ['invoer', 'Zijn de jaarcijfers en IB-aangiften juist en volledig ingevoerd?'],
  ['correcties', 'Zijn de correcties op resultaat en balans juist toegepast en gemotiveerd?'],
  ['kader', 'Is het inkomen conform het beleidskader bepaald, of is de afwijking gemotiveerd?'],
  ['bestendig', 'Zijn bestendigheid en onttrekbaarheid van het inkomen voldoende onderbouwd?'],
  ['prive', 'Zijn privéverplichtingen (BKR, zakelijk krediet, R/C directie) beoordeeld?'],
  ['herleidbaar', 'Zijn aantekeningen en conclusie volledig en herleidbaar?'],
];

export const ACCREDITATIES = ['Basis', 'Basis+', 'Medium', 'Medium+', 'Top', 'Top+'];

const EERSTE = { Basis: ['Basis'], 'Basis+': ['Basis'], Medium: ['Basis', 'Medium'], 'Medium+': ['Basis', 'Medium'], Top: ['Basis', 'Medium', 'Top'], 'Top+': ['Basis', 'Medium', 'Top'] };
const TWEEDE = { Basis: [], 'Basis+': ['Basis'], Medium: ['Basis'], 'Medium+': ['Basis', 'Medium'], Top: ['Basis', 'Medium'], 'Top+': ['Basis', 'Medium', 'Top'] };

export function magFiatteren(accreditatie, niveau, welke) {
  const tabel = welke === 2 ? TWEEDE : EERSTE;
  return (tabel[accreditatie] || []).includes(niveau || 'Basis');
}
