// Beleidskaders als configuratie. De rekenkern leest uitsluitend deze parameters (geen vergelijkingen
// op de naam van een kader), zodat een kader een extra object is. Teksten zijn samenvattingen in eigen
// woorden met een verwijzing naar het onderdeel van de bron; bronteksten worden niet overgenomen.
//
// familie        'ABN' = berekening per hoofdbedrijf (BZI-methode); 'NHG' = berekening op totaalniveau
// totaal         welke totaalberekening: NHG, ABN, ASN, KNAB of OPT
// correctieModel welke set automatische balanscorrecties (NHG = uitgebreid, ABN = Woonbeleid)
// toetsen        winst / liquiditeit / werkkapitaal / solvabiliteit: welke toets per onderdeel
// box2.model     NHG (route 1/2), ABN (3.63), ASN (loon + winst na Vpb), OPT (look-through)

export const RECHTSVORMEN = {
  EZ: { label: 'Eenmanszaak', kort: 'EenmZk', soort: 'IB' },
  VOF: { label: 'Vennootschap onder firma', kort: 'V.O.F.', soort: 'IB' },
  MTS: { label: 'Maatschap', kort: 'Mtschp', soort: 'IB' },
  CV: { label: 'Commanditaire vennootschap', kort: 'C.V.', soort: 'IB' },
  COOP: { label: 'Coöperatie', kort: 'Coöp', soort: 'IB' },
  STICHTING: { label: 'Stichting', kort: 'Sticht.', soort: 'IB' },
  BV: { label: 'Besloten vennootschap', kort: 'B.V.', soort: 'VPB' },
  NV: { label: 'Naamloze vennootschap', kort: 'N.V.', soort: 'VPB' },
};

export const BEROEPSGROEPEN = {
  overig: 'Overig',
  medisch_juridisch: 'Medisch specialist, huisarts, tandarts, verloskundige, apotheker, advocaat, notaris of accountant',
  fysiotherapeut: 'Fysiotherapeut',
};

const NHG_BANDBREEDTE = { laag: 0.20, norm: 0.25, hoog: 0.30, trend: 0.10 };
const BAND_IB = { laag: 0.15, norm: 0.20, hoog: 0.25, trend: 0.10 };
const BAND_VPB = { laag: 0.20, norm: 0.25, hoog: 0.30, trend: 0.10 };

/** Knab: sectoren waarvoor geen zakelijk inkomen wordt vastgesteld (Nee) of die worden voorgelegd. */
const KNAB_SECTOREN = [
  ['92', 'Loterijen en kansspelen', 'nee'],
  ['96', 'Wellness, overige dienstverlening en uitvaartbranche', 'voorleggen'],
  ['I', 'Logies-, maaltijd- en drankverstrekking (horeca)', 'voorleggen'],
  ['G', 'Groot- en detailhandel; reparatie van auto\'s', 'voorleggen'],
  ['46.77', 'Groothandel in afval en schroot', 'nee'],
  ['64.92.4', 'Wisselmakelaars en overige kredietverstrekking', 'nee'],
  ['47.26', 'Winkels in tabaksproducten', 'voorleggen'],
  ['L', 'Verhuur van en handel in onroerend goed', 'nee'],
  ['66.19.2', 'Marketmakers', 'nee'],
  ['66.19', 'Geldwissel, hypotheek- en kredietbemiddeling (DNB-vergunning vereist)', 'voorleggen'],
  ['69.10.4', 'Deurwaarderskantoren (NVI-keurmerk vereist)', 'voorleggen'],
  ['82.91', 'Kredietinformatie- en incassobureaus (keurmerk vereist)', 'voorleggen'],
  ['94', 'Levensbeschouwelijke, politieke en ideële organisaties, hobbyclubs', 'nee'],
  ['20', 'Vervaardiging van chemische producten (incl. kruit en springstoffen)', 'nee'],
  ['12', 'Vervaardiging van tabaksproducten', 'nee'],
  ['30.40', 'Vervaardiging van militaire gevechtsvoertuigen', 'nee'],
  ['25.40', 'Vervaardiging van wapens en munitie', 'nee'],
  ['46.35', 'Groothandel in tabaksproducten', 'nee'],
  ['84', 'Openbaar bestuur en verplichte sociale verzekeringen', 'nee'],
  ['99', 'Extraterritoriale organisaties', 'nee'],
  ['24.41', 'Vervaardiging van edelmetalen', 'nee'],
  ['24.46', 'Smelten en raffineren van uranium', 'nee'],
  ['B', 'Winning van delfstoffen', 'nee'],
  ['06', 'Winning van aardolie en aardgas', 'nee'],
];

export const KADERS = {
  NHG: {
    id: 'NHG',
    naam: 'NHG Toetskaders Inkomensverklaring Ondernemer',
    versie: 'versie 01.2026 (ingangsdatum 1 maart 2025)',
    kort: 'NHG',
    bestemdVoor: 'Hypotheek met NHG',
    nhg: true,
    familie: 'NHG',
    totaal: 'NHG',
    correctieModel: 'NHG',
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 5, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: { m: 4, d: 1 },
    tussentijdsHeleMaanden: true,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.25,
    bandbreedte: NHG_BANDBREEDTE,
    toetsen: { winst: 'NHG', liquiditeit: 'NHG', werkkapitaal: 'info', solvabiliteit: 'bandbreedte', herstel: 'akkoord' },
    rcDrempel: 17500,
    box3ZonderBewijs: 1000,
    positieveCorrecties: true,
    fiscaleCorrecties: true,
    incidenteelAlleenFiscaal: true,
    goodwillFactor: () => 1,
    goodwillEVNietCorrigeren: true,
    cashflowCorrectie: false,
    bijtellingDGA: 'laatste', // alleen laatste toetsjaar en controlejaar
    bijtellingDrempel: 0,
    starterFactoren: null,
    minBelang: 0.05,
    landen: ['NL'],
    box2: { model: 'NHG', minMaanden: 36, afslag: 0.25, solvabiliteitDBT: 0.25 },
    overwinst: { winst: 'RVBcor', zeggenschap: 'meerderheid', maanden: 'ondernemer', winstToets: 'NHG', kasstroom: false, balanstest: false, minUitkering: true },
    dbt: { solvNorm: 0.25, liqMethode: 'werkkapitaal', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: false, vast: true },
    loondienstMeenemen: true,
    dertigProcentRegel: { vanafPct: 80, pct: 0.30 },
    geldigheidMaanden: 6,
    inkomensberekening: [
      'Het gemiddelde inkomen in de afgelopen 3 jaren',
      'Maximaal het inkomen in het laatste jaar',
      'Nooit meer dan het geëxtrapoleerde inkomen in het lopende jaar (indien van toepassing)',
    ],
    bron: 'Toetskaders Inkomensverklaring Ondernemer met Toelichting en Documentenlijst (NHG)',
    bronStatus: 'Openbaar toetskader (versie 2026-1, samenvoeging zonder inhoudelijke wijziging).',
    regels: [
      'Inkomen: gemiddelde van 3 jaar, maximaal het laatste jaar; het lopende jaar kan alleen verlagen (extrapolatie 30/360).',
      'Vanaf 1 april kan het oudste jaar worden vervangen door het gerealiseerde resultaat van het lopende jaar (stappen a, b en d).',
      'Winst ≥ 0 in het laatste toetsjaar en het controlejaar; current ratio ≥ 1; solvabiliteit volgens het bandbreedtemodel 20/25/30%.',
      'Box 2: route 1 uitgekeerd dividend of route 2 overwinst na dubbele balanstoets (solvabiliteit 25%, werkkapitaal) met 25% afslag.',
      'Loondienst ≥ 80%: ondernemersinkomen maximaal 30% van het fulltime loon (formule A + B).',
    ],
    aannames: [],
  },
  ABN: {
    id: 'ABN',
    naam: 'ABN AMRO Woonbeleid zakelijk inkomen',
    versie: 'beleidsregels 3.55 t/m 3.67 en 3.109',
    kort: 'ABN AMRO',
    bestemdVoor: 'ABN AMRO (zonder NHG)',
    nhg: false,
    familie: 'ABN',
    totaal: 'ABN',
    correctieModel: 'ABN',
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 7, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: null,
    tussentijdsHeleMaanden: false,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.20,
    bandbreedte: null,
    toetsen: { winst: 'ABN', liquiditeit: 'ABN', werkkapitaal: 'info', solvabiliteit: 'ABN', herstel: 'akkoord' },
    rcDrempel: 17500,
    box3ZonderBewijs: 0,
    positieveCorrecties: false,
    fiscaleCorrecties: false,
    incidenteelAlleenFiscaal: false,
    goodwillFactor: (beroepsgroep) => ({ medisch_juridisch: 0, fysiotherapeut: 0.25 }[beroepsgroep] ?? 1),
    goodwillEVNietCorrigeren: false,
    cashflowCorrectie: true,
    bijtellingDGA: 'alle',
    bijtellingDrempel: 0,
    starterFactoren: [
      { vanafMaanden: 12, factor: 0.75, label: '1 tot 2 boekjaren: 75% van het gemiddelde' },
      { vanafMaanden: 24, factor: 0.90, label: '2 tot 3 boekjaren: 90% van het gemiddelde' },
      { vanafMaanden: 36, factor: 1, label: '3 boekjaren of langer: gemiddelde, maximaal laatste jaar' },
    ],
    dgaMinBelang: 0.20,
    minBelang: 0.20,
    landen: ['NL', 'BE', 'DE', 'LU'],
    alleenVestigingsland: true,
    beroepsregister: true,
    box2: { model: 'ABN', minMaanden: 36 },
    overwinst: { winst: 'NWcor', zeggenschap: 'volledig', maanden: 'totT3', winstToets: 'LAATSTE', kasstroom: true, balanstest: true, minUitkering: true },
    dbt: { solvNorm: 0.20, liqMethode: 'cr', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: true, vast: false },
    loondienstMeenemen: false,
    dertigProcentRegel: null,
    geldigheidMaanden: 6,
    inkomensberekening: [
      'Het gemiddelde inkomen uit de laatste drie boekjaren',
      'Maximaal het inkomen uit het laatste boekjaar',
      'Starters: 75% (1-2 boekjaren) of 90% (2-3 boekjaren) van het gemiddelde, maximaal de prognose (RA/AA)',
    ],
    bron: 'ABN AMRO Woonbeleid, onderdeel Inkomen > Onderneming',
    bronStatus: 'Intern beleid van ABN AMRO; in ZIB vertaald in eigen woorden. Eigen interpretatie, geen officiële publicatie.',
    regels: [
      'Berekend inkomen (BZI) per hoofdbedrijf: gemiddeld DGA-inkomen of saldo fiscale winst na correcties, plus gemiddeld dividend tot maximaal de gemiddelde nettowinst × belang.',
      'Toets Woonbeleid: laagste van gemiddelde en laatste boekjaar; starters 75% / 90%, maximaal de prognose (3.57/3.62).',
      'Toetskader per hoofdbedrijf inclusief deelnemingen: winst, current ratio ≥ 1 of gemiddelde liquiditeitsruimte, solvabiliteit ≥ 20% of gemiddelde solvabiliteitsruimte.',
      'Dividend (3.63): uitgekeerd dividend, eventueel overwinst na uitkerings- en balanstest; holdingroute voor dividend uit een minderheidsdeelneming.',
    ],
    aannames: [
      'De formule van het berekend inkomen (dividend begrensd op de gemiddelde nettowinst × belang, ook als die negatief is) is afgeleid uit de uitkomst van de rekentool in een praktijkdossier.',
    ],
  },
  ASN: {
    id: 'ASN',
    naam: 'ASN Bank (voorheen de Volksbank): bestendig inkomen uit onderneming',
    versie: 'Risk Policy geaccrediteerde partijen versie 1.5 (1 juli 2024)',
    kort: 'ASN Bank',
    bestemdVoor: 'ASN Bank, voorheen de Volksbank (ASN, SNS, RegioBank, BLG Wonen), zonder NHG',
    nhg: false,
    familie: 'NHG',
    totaal: 'ASN',
    correctieModel: 'NHG',
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 5, d: 1 },
    tussentijdsVerplichtVanaf: null,
    vervangenVanaf: { m: 4, d: 1 },
    tussentijdsHeleMaanden: false,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.20,
    bandbreedte: null,
    toetsen: { winst: 'LAATSTE', liquiditeit: 'ENOF', werkkapitaal: 'info', solvabiliteit: 'minimum', herstel: 'attentie' },
    rcDrempel: 17500,
    rcInkomen: { pct: 0.02, werkelijkeLasten: false },
    box3ZonderBewijs: 0,
    positieveCorrecties: true,
    fiscaleCorrecties: true,
    incidenteelAlleenFiscaal: true,
    goodwillFactor: () => 1,
    goodwillEVNietCorrigeren: false,
    ivaInclGoodwillEV: true,
    cashflowCorrectie: false,
    vervallenHuurPct: 0.85,
    bijtellingDGA: 'laatste',
    bijtellingDrempel: 0.15,
    starterFactoren: [
      { vanafMaanden: 12, factor: 0.75, label: '12 tot 24 maanden definitieve cijfers: 75%' },
      { vanafMaanden: 24, factor: 0.90, label: '24 maanden of meer definitieve cijfers: 90%' },
      { vanafMaanden: 36, factor: 1, label: '36 maanden of langer: geen starter' },
    ],
    starter: { methode: 'maanden', startjaarUitsluiten: 'tweeVolleJaren' },
    minBelang: 0.05,
    landen: ['NL'],
    maxEntiteiten: 3,
    maxMinderheidsdeelnemingen: 2,
    verliesBVInInkomen: true,
    box2: { model: 'ASN', minMaanden: 36, afslag: 0 },
    overwinst: { winst: 'NWcor', zeggenschap: 'meerderheid', maanden: 'ondernemer', winstToets: 'LAATSTE', kasstroom: false, balanstest: false, minUitkering: false },
    dbt: { solvNorm: 0.20, liqMethode: 'cr', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: false, vast: true },
    loondienstMeenemen: false,
    dertigProcentRegel: { vanafPct: 80, pct: 0.30 },
    incidentRegel: true,
    geldigheidMaanden: 6,
    inkomensberekening: [
      'IB-ondernemer: gemiddelde saldo fiscale winst van 3 boekjaren, maximaal het laatste jaar; een verlies telt mee',
      'DGA: gemiddeld loon van 3 jaar (een verlies van de BV telt mee); maximaal het loon plus het resultaat na Vpb van het laatste jaar',
      'DGA met meer dan 50%: plus de gemiddelde winst na Vpb en het gemiddelde uitgekeerde dividend, mits de BV na onttrekking een current ratio ≥ 1 en solvabiliteit ≥ 20% houdt',
      'Starters (12-36 maanden): 75% of 90% van het gemiddelde over de werkelijke maanden, maximaal het laatste volledige jaar en de prognose',
    ],
    bron: 'De Volksbank, Risk Policy: vaststellen zakelijk inkomen door geaccrediteerde partijen, v1.5 (1-7-2024); asnbank.nl (2026)',
    bronStatus: 'Intern document voor geaccrediteerde partijen; hier in eigen woorden. Sinds 1 juli 2025 heet de Volksbank ASN Bank; controleer of v1.5 nog de geldende versie is.',
    regels: [
      '§3.1 IB: gemiddelde saldo fiscale winst (kapitaalsvergelijking) over 3 boekjaren, maximaal het laatste jaar; verliezen tellen mee.',
      '§3.2 DGA: gemiddeld loon; maximum is loon plus resultaat na Vpb van het laatste jaar. Bij meer dan 50% zeggenschap tellen de gemiddelde winst na Vpb en het gemiddelde dividend mee (dividend per jaar maximaal de winst van dat jaar), mits current ratio > 1 en solvabiliteit > 20% na onttrekking.',
      '§3.2 Een jaarlijks terugkerend dividend uit één minderheidsdeelneming kan meetellen (expert judgement), maximaal het laatste jaar.',
      '§3.3 Maximaal drie entiteiten; bij meer dan twee minderheidsdeelnemingen geen inkomen uit onderneming.',
      '§3.6 Ratio\'s na correcties: laatste boekjaar positief, current ratio ≥ 1, solvabiliteit ≥ 20%. Bijtelling auto alleen voor het deel boven 15% van de winst of het loon; R/C directie boven € 17.500 kost minimaal 2% op het loon.',
      '§3.7 Starters: 75% (12 maanden cijfers) of 90% (24 maanden) van het gemiddelde over de werkelijke maanden; prognose kan alleen verlagen.',
      '§3.8 Een aantoonbaar incidenteel jaar (zwangerschap, wegafsluiting) kan worden vervangen door tussentijdse cijfers.',
      '§3.11 Loondienst ≥ 80%: inkomen uit onderneming maximaal 30% van het loondienstinkomen.',
    ],
    aannames: [
      '§3.2 noemt winst na Vpb én dividend; ZIB telt beide op en begrenst het totaal op loon plus winst na Vpb van het laatste jaar, zodat een uitgekeerde winst niet dubbel telt.',
      'De dubbele balanstoets (§3.2) wordt uitgevoerd op de meest recente balans met current ratio ≥ 1 en solvabiliteit ≥ 20% na onttrekking.',
      'Het lopende jaar is bij ASN geen verplichte toets; een lager geëxtrapoleerd inkomen geeft een attentie.',
    ],
    instelbaar: ['solvabiliteitMin', 'starterFactoren.0.factor', 'starterFactoren.1.factor', 'bijtellingDrempel'],
  },
  KNAB: {
    id: 'KNAB',
    naam: 'Knab toetskader zakelijk inkomen',
    versie: 'concept versie 2024.013 (25 april 2024)',
    kort: 'Knab',
    bestemdVoor: 'Knab (zonder NHG)',
    nhg: false,
    familie: 'NHG',
    totaal: 'KNAB',
    correctieModel: 'NHG',
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 7, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: { m: 4, d: 1 },
    tussentijdsHeleMaanden: true,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.20,
    bandbreedte: { IB: BAND_IB, VPB: BAND_VPB },
    toetsen: { winst: 'NHG', liquiditeit: 'ENOF', werkkapitaal: 'ENOF', solvabiliteit: 'bandbreedte', herstel: 'akkoord' },
    rcDrempel: 17500,
    rcInkomen: { pct: 0.02, werkelijkeLasten: true },
    leningDirectieInkomen: { pct: 0.02 },
    box3ZonderBewijs: 1000,
    positieveCorrecties: true,
    fiscaleCorrecties: true,
    incidenteelAlleenFiscaal: false,
    goodwillFactor: () => 1,
    goodwillEVNietCorrigeren: true,
    cashflowCorrectie: false,
    bijtellingDGA: 'laatste',
    bijtellingDrempel: 0.15,
    starterFactoren: [
      { vanafMaanden: 12, factor: 0.80, label: '12 tot 24 maanden actief: 80%' },
      { vanafMaanden: 24, factor: 0.90, label: '24 tot 36 maanden actief: 90%' },
      { vanafMaanden: 36, factor: 1, label: '36 maanden of langer: 100%' },
    ],
    starter: { methode: 'jaren', startjaarUitsluiten: 'naJuli' },
    methode123: { maxBoven111: 0.10, maxBovenNHG: 0.20 },
    minBelang: 0.05,
    landen: ['NL'],
    uitgeslotenSectoren: KNAB_SECTOREN,
    box2: { model: 'NHG', minMaanden: 36, afslag: 0.25, solvabiliteitDBT: 0.25, dividendPerJaar: true },
    overwinst: { winst: 'RVBcor', zeggenschap: 'meerderheid', maanden: 'ondernemer', winstToets: 'NHG', kasstroom: false, balanstest: false, minUitkering: false },
    dbt: { solvNorm: 0.25, liqMethode: 'werkkapitaal', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: true, vast: true },
    loondienstMeenemen: true,
    dertigProcentRegel: { vanafPct: 80, pct: 0.30 },
    beletRegel: true,
    trendRegel: { minInkomen: 10000, dalingOudst: 0.40, dalingMiddel: 0.20 },
    geldigheidMaanden: 6,
    inkomensberekening: [
      '1-2-3-methode: (1 × oudste + 2 × middelste + 3 × laatste jaar) / 6, maximaal het laatste jaar',
      'Maximaal 10% boven het gewone gemiddelde (1-1-1) en maximaal 20% boven het NHG-inkomen',
      'Starters zonder relevant voorafgaand dienstverband: 80% (12-24 maanden) of 90% (24-36 maanden), maximaal de prognose',
    ],
    bron: 'Knab, Concept toetskader zakelijk inkomen versie 2024.013 met werkinstructies (25-04-2024, opgesteld met ViiZ); Knab Hypotheek risicosectoren; knab.nl (2026)',
    bronStatus: 'Conceptversie (2024) van een intern toetskader; hier in eigen woorden. Controleer bij Knab of deze versie is vastgesteld.',
    regels: [
      'B.1.1 Box 1: saldo fiscale winst of DGA-loon over 3 jaar, maximaal het laatste jaar; DGA plus box 2.',
      'B.1.1.2 1-2-3-methode, maximaal 10% boven 1-1-1; B.1.1.0 totaal maximaal 20% boven het NHG-inkomen.',
      'B.1.2.1 Dalende trend (> 40% oudste→laatste én > 20% middelste→laatste, inkomen > € 10.000): onderbouwing met prognose (NBA 3400).',
      'B.1.3 Lopend jaar conform NHG; bij vervangen weegt het vervangende jaar 3×.',
      'B.2 Starters vanaf 12 maanden: met relevant voorafgaand dienstverband loon + zakelijk inkomen via 1-2-3; zonder: 80% / 90%, maximaal de prognose; startjaar na 1 juli mag vervallen.',
      'B.3 Bijtelling auto alleen boven 15%; lasten R/C directie en lening directie minimaal 2% per jaar.',
      'B.4 Box 2: dividend per jaar in het totaalinkomen (maximaal de winst van dat jaar); overwinst 75% na dubbele balanstoets (werkkapitaal alle jaren, solvabiliteit ≥ 25% laatste jaar en controlejaar).',
      'C Ratio\'s: winst ≥ 0, current ratio ≥ 1, werkkapitaal ≥ 0 en solvabiliteit (IB 15-25%, DGA 20-30%) in het laatste jaar en/of het controlejaar.',
      'D.1 Beletperiode (zwangerschap, ziekte, calamiteit; max. 12 maanden): vervangen door het laagste omliggende jaar, maximaal het inkomen na het belet.',
    ],
    aannames: [
      'De overwinst wordt (zoals in het kader) niet verminderd met het uitgekeerde dividend; bij de combinatieroute begrenst de uitzonderingsroute het totaal.',
      'Starters: het gemiddelde over de actieve jaren (niet over maanden), zoals de werkinstructie B.2.2.2 beschrijft.',
    ],
    instelbaar: ['starterFactoren.0.factor', 'starterFactoren.1.factor', 'methode123.maxBoven111', 'methode123.maxBovenNHG'],
  },
  OPT: {
    id: 'OPT',
    naam: 'Optimaal toetskader (ZIB): eerlijk en realistisch bestendig inkomen',
    versie: 'ZIB-ontwerp 1.0 (november 2026)',
    kort: 'Optimaal',
    bestemdVoor: 'Referentiekader; geen beleid van een geldverstrekker',
    nhg: false,
    familie: 'NHG',
    totaal: 'OPT',
    correctieModel: 'NHG',
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 7, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: null,
    tussentijdsHeleMaanden: false,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.20,
    bandbreedte: { IB: BAND_IB, VPB: BAND_VPB },
    toetsen: { winst: 'NHG', liquiditeit: 'ENOF', werkkapitaal: 'ENOF', solvabiliteit: 'bandbreedte', herstel: 'akkoord' },
    rcDrempel: 17500,
    rcInkomen: { pct: 0.02, werkelijkeLasten: true },
    leningDirectieInkomen: { pct: 0.02 },
    box3ZonderBewijs: 1000,
    positieveCorrecties: true,
    fiscaleCorrecties: true,
    incidenteelAlleenFiscaal: false,
    goodwillFactor: () => 1,
    goodwillEVNietCorrigeren: true,
    cashflowCorrectie: true,
    bijtellingDGA: 'alle',
    bijtellingDrempel: 0,
    starterFactoren: [
      { vanafMaanden: 12, factor: 0.80, label: '12 tot 24 maanden: 80%' },
      { vanafMaanden: 24, factor: 0.90, label: '24 tot 36 maanden: 90%' },
      { vanafMaanden: 36, factor: 1, label: '36 maanden of langer: 100%' },
    ],
    starter: { methode: 'jaren', startjaarUitsluiten: 'naJuli' },
    methode123: { maxBoven111: 0.10, maxBovenNHG: null },
    volatiliteit: { drempel: 0.20, factor: 0.5, max: 0.25 },
    controlejaarWeging: { vanafMaanden: 3, volledigVanaf: 9 },
    minderheidsdividend: { trackrecordJaren: 3 },
    minBelang: 0.05,
    landen: ['NL', 'BE', 'DE', 'LU'],
    landenAttentie: true,
    box2: { model: 'OPT', minMaanden: 36, afslag: 0 },
    overwinst: { winst: 'NWcor', zeggenschap: 'meerderheid', maanden: 'ondernemer', winstToets: 'NHG', kasstroom: false, balanstest: true, minUitkering: true },
    dbt: { solvNorm: 0.25, liqMethode: 'werkkapitaal', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: true, vast: true },
    loondienstMeenemen: true,
    dertigProcentRegel: { vanafPct: 80, pct: 0.30 },
    beletRegel: true,
    trendRegel: { minInkomen: 10000, dalingOudst: 0.40, dalingMiddel: 0.20 },
    geldigheidMaanden: 6,
    inkomensberekening: [
      'Economisch inkomen per jaar: box 1 (winst of loon) plus het aandeel in de winst na Vpb van BV\'s met zeggenschap, plus bestendig dividend uit minderheidsbelangen',
      'Recente jaren wegen zwaarder (1-2-3), maximaal 10% boven het gewone gemiddelde en maximaal het laatste jaar',
      'Correctie voor beweeglijkheid (variatiecoëfficiënt) en voor het lopende jaar naar rato van de lengte van de periode',
      'Ingehouden winst telt alleen voor zover die uitkeerbaar is (dubbele balanstoets en vrije reserves)',
    ],
    bron: 'Eigen ontwerp in ZIB, op basis van NHG, ABN AMRO, ASN Bank en Knab',
    bronStatus: 'Referentiekader voor een eerlijke en realistische inschatting. Geen beleid van een geldverstrekker; gebruik het als tweede mening.',
    regels: [
      'Economisch inkomen: wat de ondernemer verdient, niet hoe het fiscaal is ingericht. Een DGA met zeggenschap telt loon plus zijn aandeel in de winst na Vpb; dividend telt dan niet nog eens (dat komt uit dezelfde winst).',
      'Normalisatie: incidentele baten én lasten worden gecorrigeerd (niet alleen fiscale), fiscale posten (investeringsaftrek, willekeurige afschrijving, niet-aftrekbare kosten) worden teruggedraaid, contractuele aflossingen boven de afschrijvingen drukken de onttrekbare kasstroom.',
      'Weging: 1-2-3 (recente jaren voorspellen beter), maximaal 10% boven het gewone gemiddelde en maximaal het laatste jaar.',
      'Lopend jaar: een lager geëxtrapoleerd inkomen weegt mee naar rato van de lengte van de periode (vanaf 3 maanden, volledig vanaf 9 maanden); seizoenspatronen maken een korte periode onbetrouwbaar.',
      'Beweeglijkheid: bij een variatiecoëfficiënt boven 20% gaat de helft van het meerdere eraf, maximaal 25%.',
      'Ingehouden winst telt alleen voor het deel dat na een dubbele balanstoets (solvabiliteit IB 20% / BV 25%, werkkapitaal) en uit vrije reserves kan worden uitgekeerd; geen vaste afslag van 25%.',
      'Minderheidsbelangen (geen zeggenschap): alleen werkelijk ontvangen dividend met een trackrecord van 3 jaar, per jaar maximaal de winst van de deelneming (uitkering uit reserves is geen inkomen), maximaal het laatste jaar.',
      'Groepseliminatie: resultaat deelnemingen en intern dividend tellen bij de ontvanger niet mee; de bron telt naar belang (look-through), zodat niets dubbel telt.',
      'Starters: 80% / 90%, maar 100% bij aantoonbaar relevante ervaring in dezelfde branche; altijd maximaal de prognose.',
      'Beletperiode (zwangerschap, ziekte, calamiteit) mag worden vervangen door het laagste omliggende jaar, maximaal het inkomen erna.',
      'Toetsing: winst ≥ 0, current ratio ≥ 1 en werkkapitaal ≥ 0 in het laatste jaar of het controlejaar; solvabiliteit IB 15/20/25%, BV 20/25/30% (bandbreedte).',
    ],
    aannames: [
      'De parameters (weging, beweeglijkheid, lopend jaar, starters) zijn ontwerpkeuzes en zijn per dossier instelbaar.',
      'Ontvangen dividend van deelnemingen moet bij de ontvanger onder Resultaat deelnemingen zijn geboekt; ZIB haalt die post weg en telt de bron naar belang.',
    ],
    instelbaar: ['volatiliteit.drempel', 'volatiliteit.factor', 'volatiliteit.max', 'methode123.maxBoven111',
      'controlejaarWeging.volledigVanaf', 'starterFactoren.0.factor', 'starterFactoren.1.factor', 'minderheidsdividend.trackrecordJaren'],
  },
};

export const KADER_VOLGORDE = ['NHG', 'ABN', 'ASN', 'KNAB', 'OPT'];

/** Labels van de instelbare parameters (pad → [label, eenheid]). */
export const PARAM_LABELS = {
  solvabiliteitMin: ['Minimale solvabiliteit', 'pct'],
  bijtellingDrempel: ['Bijtelling auto: vrijgesteld deel van winst of loon', 'pct'],
  'starterFactoren.0.factor': ['Starter 12-24 maanden', 'pct'],
  'starterFactoren.1.factor': ['Starter 24-36 maanden', 'pct'],
  'methode123.maxBoven111': ['1-2-3: maximaal boven het gewone gemiddelde', 'pct'],
  'methode123.maxBovenNHG': ['Maximaal boven het NHG-inkomen', 'pct'],
  'volatiliteit.drempel': ['Beweeglijkheid: drempel variatiecoëfficiënt', 'pct'],
  'volatiliteit.factor': ['Beweeglijkheid: afslag per procentpunt boven de drempel', 'factor'],
  'volatiliteit.max': ['Beweeglijkheid: maximale afslag', 'pct'],
  'controlejaarWeging.volledigVanaf': ['Lopend jaar weegt volledig vanaf (maanden)', 'getal'],
  'minderheidsdividend.trackrecordJaren': ['Trackrecord dividend minderheidsbelang (jaren)', 'getal'],
};

export const SOORTEN = {
  IKV: 'Inkomensverklaring',
  NUL: '0-verklaring',
};

export function soortOndernemer(rechtsvorm) {
  return RECHTSVORMEN[rechtsvorm]?.soort || 'IB';
}

export function kaderLabel(id) {
  return KADERS[id]?.kort || id;
}

/** Keuzelijst voor een kader: { id: naam }. */
export function kaderOpties() {
  return Object.fromEntries(KADER_VOLGORDE.map((id) => [id, `${KADERS[id].kort}: ${KADERS[id].naam.replace(/^.*?: /, '')}`]));
}

function zetPad(obj, pad, waarde) {
  const delen = pad.split('.');
  let o = obj;
  for (let i = 0; i < delen.length - 1; i += 1) {
    const k = delen[i];
    o[k] = Array.isArray(o[k]) ? o[k].map((x) => (x && typeof x === 'object' ? { ...x } : x)) : { ...(o[k] || {}) };
    o = o[k];
  }
  o[delen[delen.length - 1]] = waarde;
}

export function leesPad(obj, pad) {
  return pad.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

/**
 * Het kader van een dossier, met de per dossier ingestelde parameters (alleen de parameters die het
 * kader als instelbaar aanmerkt, binnen redelijke grenzen).
 */
export function kaderVoor(idOfDossier, instellingen) {
  const id = typeof idOfDossier === 'string' ? idOfDossier : idOfDossier?.kader;
  const basis = KADERS[id] || KADERS.NHG;
  const inst = instellingen ?? (typeof idOfDossier === 'object' ? idOfDossier?.instellingen : null) ?? {};
  const over = inst.kaderParams?.[basis.id];
  if (!over || !basis.instelbaar?.length) return basis;
  const k = { ...basis };
  let gewijzigd = false;
  const aangepast = {};
  basis.instelbaar.forEach((pad) => {
    // Percentages worden ingevoerd als procent (20 = 20%), factoren en aantallen als getal.
    const v = over[pad] ?? leesPad(over, pad);
    if (v === undefined || v === null || v === '') return;
    let x = Number(v);
    if (!Number.isFinite(x)) return;
    const [, eenheid] = PARAM_LABELS[pad] || [];
    if (eenheid === 'pct') x /= 100;
    const grens = eenheid === 'getal' ? [0, 36] : eenheid === 'factor' ? [0, 2] : [0, 1];
    zetPad(k, pad, Math.min(grens[1], Math.max(grens[0], x)));
    aangepast[pad] = leesPad(k, pad);
    gewijzigd = true;
  });
  if (gewijzigd) k.aangepast = aangepast;
  return k;
}

/** Bandbreedte (laag/norm/hoog/trend) voor de soort ondernemer, of null. */
export function bandbreedteVoor(kader, soort) {
  const b = kader.bandbreedte;
  if (!b) return null;
  if (b.norm !== undefined) return b;
  return b[soort] || b.IB || null;
}

/** Norm solvabiliteit voor de soort ondernemer (bandbreedte of minimum). */
export function solvNorm(kader, soort) {
  return bandbreedteVoor(kader, soort)?.norm ?? kader.solvabiliteitMin;
}

/** Starterfactor bij een aantal maanden ondernemerschap. */
export function starterFactor(kader, maanden) {
  const f = kader.starterFactoren;
  if (!f || maanden >= 36) return { factor: 1, label: '' };
  if (maanden < 12) return { factor: 0, label: 'Korter dan 12 maanden: geen inkomen' };
  const r = [...f].reverse().find((x) => maanden >= x.vanafMaanden) || f[0];
  return { factor: r.factor, label: r.label || '' };
}

/** Knab-sectorcontrole op basis van de SBI-code(s) van een onderneming. */
export function sectorControle(kader, sbiTekst, branche = '') {
  const lijst = kader.uitgeslotenSectoren;
  if (!lijst?.length) return null;
  const codes = String(sbiTekst || '').split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);
  const SECTIE = (code) => {
    const n = parseInt(code.slice(0, 2), 10);
    if (!Number.isFinite(n)) return '';
    if (n >= 55 && n <= 56) return 'I';
    if (n >= 45 && n <= 47) return 'G';
    if (n === 68) return 'L';
    if (n >= 5 && n <= 9) return 'B';
    return '';
  };
  for (const code of codes) {
    const c = code.replace(/\s.*$/, '');
    const treffer = lijst
      .filter(([k]) => (/^[A-Z]$/.test(k) ? SECTIE(c) === k : c === k || c.startsWith(`${k}.`) || (k.length === 2 && c.startsWith(k))))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (treffer) return { code: c, sector: treffer[1], oordeel: treffer[2] };
  }
  if (/seks|sex|drugs|wapen|munitie|explosie|airsoft|paintball/i.test(branche)) return { code: '', sector: branche, oordeel: 'nee' };
  if (/horeca|restaurant|café|cafe|hotel/i.test(branche)) return { code: '', sector: branche, oordeel: 'voorleggen' };
  return null;
}
