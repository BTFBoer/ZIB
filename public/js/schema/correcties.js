// Handmatige correcties per jaar, zoals in de rekentool van de bank (BZI): winstcorrecties en
// vermogenscorrecties met een vast type. Elke correctie wordt herleidbaar als regel getoond
// (type, bedrag, toelichting) en telt mee in zowel het NHG- als het ABN AMRO-kader.
//
// teken:  -1 = altijd verlagend, +1 = altijd verhogend, 0 = bedrag met teken zoals ingevoerd
// soorten: voor welke soort ondernemer de correctie beschikbaar is (IB / VPB)
// effect (alleen vermogenscorrecties): welke grootheden wijzigen naast het aansprakelijk vermogen
//   bt = balanstotaal, va = vlottende activa, kvv = kort vreemd vermogen (tegengesteld teken)
// auto:   sleutel van de automatische correctie uit de detailbalans die door dit type wordt vervangen

export const WINST_CORRECTIES = {
  cashflow: { label: 'Correctie cashflow', teken: 0, soorten: ['IB', 'VPB'],
    hint: 'Verschil tussen de werkelijk betaalde contractuele aflossingen en de afschrijvingen (meestal negatief).' },
  incidenteleBaat: { label: 'Incidentele baat', teken: -1, soorten: ['IB', 'VPB'], auto: 'incidenteleBaten' },
  incidenteleLast: { label: 'Incidentele last', teken: +1, soorten: ['IB', 'VPB'], auto: 'incidenteleLasten' },
  resultaatDeelneming: { label: 'Resultaat deelneming', teken: 0, soorten: ['VPB'],
    hint: 'Voer de nettowinst in ná belasting en corrigeer hier het resultaat uit de deelneming.' },
  overig: { label: 'Overige correctie', teken: 0, soorten: ['IB', 'VPB'] },
};

export const VERMOGENS_CORRECTIES = {
  immaterieel: { label: 'Correctie immateriële activa', zijde: 'activa', teken: -1, soorten: ['IB', 'VPB'], effect: ['bt'], auto: 'iva' },
  leningDirectie: { label: 'Lening directie (u/g)', zijde: 'activa', teken: -1, soorten: ['VPB'], effect: ['bt'], auto: 'leningDGA' },
  overigVast: { label: 'Overig – activazijde, vaste activa', zijde: 'activa', teken: -1, soorten: ['IB', 'VPB'], effect: ['bt'] },
  overigVlottend: { label: 'Overig – activazijde, vlottende activa', zijde: 'activa', teken: -1, soorten: ['IB', 'VPB'], effect: ['bt', 'va'] },
  rcDirectie: { label: 'Rekening courant directie', zijde: 'activa', teken: -1, soorten: ['VPB'], effect: ['bt', 'va'], auto: 'rc' },
  box3: { label: 'Box 3 vermogen', zijde: 'activa', teken: +1, soorten: ['IB', 'VPB'], effect: ['bt', 'va'], auto: 'box3', alleenNHG: true },
  herwaardering: { label: 'Herwaardering a.d.h.v. stille reserves', zijde: 'activa', teken: +1, soorten: ['IB', 'VPB'], effect: ['bt'], auto: 'stilleReserves', alleenNHG: true },
  for: { label: 'Fiscale oudedagsreserve', zijde: 'passiva', teken: +1, soorten: ['IB'], effect: [] },
  latentHerwaardering: { label: 'Voorziening latente belasting i.v.m. herwaarderingen', zijde: 'passiva', teken: +1, soorten: ['IB', 'VPB'], effect: [], auto: 'latentPassief', alleenNHG: true },
  achtergesteld: { label: 'Achtergestelde lening', zijde: 'passiva', teken: +1, soorten: ['IB', 'VPB'], effect: [], auto: 'achtergesteld', alleenNHG: true },
  odv: { label: 'ODV / pensioenvoorziening', zijde: 'passiva', teken: +1, soorten: ['VPB'], effect: [], auto: 'odv', alleenNHG: true },
  lvv: { label: 'Lang vreemd vermogen (lening o/g)', zijde: 'passiva', teken: +1, soorten: ['VPB'], effect: [], alleenNHG: true },
  overigPassivaLang: { label: 'Overig – passivazijde (langlopend)', zijde: 'passiva', teken: +1, soorten: ['IB', 'VPB'], effect: [], alleenNHG: true },
  overigPassivaKort: { label: 'Overig – passivazijde (kortlopend)', zijde: 'passiva', teken: 0, soorten: ['IB', 'VPB'], effect: ['kvv'] },
};

/** Effect van een correctie met teken (verlagend = negatief). */
export function getekend(type, bedrag, lijst) {
  const def = lijst[type];
  const x = Number(bedrag) || 0;
  if (!def) return x;
  if (def.teken === -1) return -Math.abs(x);
  if (def.teken === +1) return Math.abs(x);
  return x;
}

/** Correctietypes die voor deze soort ondernemer beschikbaar zijn. */
export function typesVoor(lijst, soort) {
  return Object.entries(lijst).filter(([, d]) => d.soorten.includes(soort));
}
