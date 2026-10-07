// Beleidskaders als configuratie. De rekenkern leest uitsluitend deze parameters,
// zodat een nieuw kader (bijv. een andere geldverstrekker) als extra object kan worden toegevoegd.
// Teksten zijn samenvattingen in eigen woorden met een verwijzing naar de bronregel.

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

export const KADERS = {
  NHG: {
    id: 'NHG',
    naam: 'NHG Toetskaders Inkomensverklaring Ondernemer',
    versie: 'versie 01.2026 (ingangsdatum 1 maart 2025)',
    kort: 'NHG',
    bestemdVoor: 'Hypotheek met NHG',
    nhg: true,
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 5, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: { m: 4, d: 1 },
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.25,
    bandbreedte: { laag: 0.20, norm: 0.25, hoog: 0.30, trend: 0.10 },
    rcDrempel: 17500,
    box3ZonderBewijs: 1000,
    positieveCorrecties: true,
    goodwillFactor: () => 1,
    goodwillEVNietCorrigeren: true,
    cashflowCorrectie: false,
    bijtellingDGA: 'laatste', // alleen laatste toetsjaar en controlejaar
    starterFactoren: null,
    box2: { minMaanden: 36, afslag: 0.25, solvabiliteitDBT: 0.25 },
    loondienstMeenemen: true,
    dertigProcentRegel: { vanafPct: 80, pct: 0.30 },
    geldigheidMaanden: 6,
    inkomensberekening: [
      'Het gemiddelde inkomen in de afgelopen 3 jaren',
      'Maximaal het inkomen in het laatste jaar',
      'Nooit meer dan het geëxtrapoleerde inkomen in het lopende jaar (indien van toepassing)',
    ],
    bron: 'Toetskaders Inkomensverklaring Ondernemer met Toelichting en Documentenlijst (NHG)',
  },
  ABN: {
    id: 'ABN',
    naam: 'ABN AMRO Woonbeleid zakelijk inkomen',
    versie: 'beleidsregels 3.55 t/m 3.67 en 3.109',
    kort: 'ABN AMRO',
    bestemdVoor: 'ABN AMRO (zonder NHG)',
    nhg: false,
    minMaandenKvK: 12,
    definitiefVerplichtVanaf: { m: 7, d: 1 },
    tussentijdsVerplichtVanaf: { m: 8, d: 1 },
    vervangenVanaf: null,
    liquiditeitMin: 1.0,
    solvabiliteitMin: 0.20,
    bandbreedte: null,
    rcDrempel: 17500,
    box3ZonderBewijs: 0,
    positieveCorrecties: false,
    goodwillFactor: (beroepsgroep) => ({ medisch_juridisch: 0, fysiotherapeut: 0.25 }[beroepsgroep] ?? 1),
    goodwillEVNietCorrigeren: false,
    cashflowCorrectie: true,
    bijtellingDGA: 'alle',
    starterFactoren: [
      { vanafMaanden: 12, factor: 0.75, label: '1 tot 2 boekjaren: 75% van het gemiddelde' },
      { vanafMaanden: 24, factor: 0.90, label: '2 tot 3 boekjaren: 90% van het gemiddelde' },
      { vanafMaanden: 36, factor: 1, label: '3 boekjaren of langer: gemiddelde, maximaal laatste jaar' },
    ],
    dgaMinBelang: 0.20,
    box2: { minMaanden: 36 },
    loondienstMeenemen: false,
    dertigProcentRegel: null,
    geldigheidMaanden: 6,
    inkomensberekening: [
      'Het gemiddelde inkomen uit de laatste drie boekjaren',
      'Maximaal het inkomen uit het laatste boekjaar',
      'Starters: 75% (1-2 boekjaren) of 90% (2-3 boekjaren) van het gemiddelde, maximaal de prognose (RA/AA)',
    ],
    bron: 'ABN AMRO Woonbeleid, onderdeel Inkomen > Onderneming',
  },
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
