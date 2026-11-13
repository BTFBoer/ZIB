import { num, isIngevuld } from '../util.js';

export function heeftBedrag(v) {
  return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
}

export function balansTotalen(b = {}) {
  const v = (k) => num(b[k]);
  const IVA = v('ivaGoodwillEV') + v('ivaGoodwillNietEV') + v('ivaOverig');
  const MVA = v('mvaGebouwen') + v('mvaMachines') + v('mvaOverig');
  const FVA = v('fvaDeelnemingen') + v('fvaGroep') + v('fvaDGA') + v('fvaParticipanten') + v('fvaOverig') + v('fvaLatenteBelasting');
  const VOORRADEN = v('voorraden') + v('onderhandenWerk');
  const VORDERINGEN = v('debiteuren') + v('vordOB') + v('vordGroepKort') + v('vordDGAKort')
    + v('vordParticipantenKort') + v('vordOverig') + v('vordLatenteBelasting');
  const VA = VOORRADEN + VORDERINGEN + v('effecten') + v('liquideMiddelen');
  const TA = IVA + MVA + FVA + VA;
  const EV = v('evKapitaal') + v('evAgio') + v('evWinstreserve') + v('evFOR') + v('evOverig');
  const VZ = v('vzGarantie') + v('vzStamrecht') + v('vzODV') + v('vzLatenteBelasting') + v('vzOverig');
  const LVV = v('llLeningen') + v('llKrediet') + v('llGroep') + v('llDGA') + v('llAchtergesteld');
  const KVV = v('klCrediteuren') + v('klLoonheffing') + v('klOB') + v('klGroep') + v('klDGA')
    + v('klParticipanten') + v('klKrediet') + v('klVPB') + v('klAflossing') + v('klOverig');
  const TP = EV + VZ + LVV + KVV;
  return { IVA, MVA, FVA, VOORRADEN, VORDERINGEN, VA, TA, EV, VZ, LVV, KVV, TP, VERSCHIL: TA - TP };
}

export function heeftBalans(b = {}) {
  return Object.values(b).some((x) => num(x) !== 0);
}

export function vwTotalen(w = {}) {
  const v = (k) => num(w[k]);
  const BRUTO = v('omzet') + v('overigeOpbrengsten') - v('inkoopwaarde') - v('uitbesteedWerk');
  const AFSCHRIJVINGEN = v('afschrijvingIVA') + v('afschrijvingMVA');
  const KOSTEN = v('lonen') + v('salarisDGA') + v('socialeLasten') + v('pensioenlasten') + AFSCHRIJVINGEN
    + v('huisvesting') + v('autokosten') + v('verkoopkosten') + v('kantoorkosten')
    + v('algemeneKosten') + v('overigeKosten');
  const BEDRIJFSRESULTAAT = BRUTO - KOSTEN;
  const FIN = v('financieleBaten') - v('financieleLasten');
  const BUITENGEWOON = v('bijzondereBaten') - v('bijzondereLasten');
  const RVB = BEDRIJFSRESULTAAT + FIN + BUITENGEWOON;
  const NW = RVB + v('resultaatDeelnemingen') - v('vpb');
  const KOSTPRIJS = v('inkoopwaarde') + v('uitbesteedWerk') + (KOSTEN - AFSCHRIJVINGEN);
  return { OMZET: v('omzet'), BRUTO, AFSCHRIJVINGEN, KOSTEN, BEDRIJFSRESULTAAT, FIN, BUITENGEWOON, RVB, NW, KOSTPRIJS };
}

export function heeftVW(w = {}) {
  return Object.entries(w).some(([k, x]) => k !== 'prognose' && k !== 'fte' && num(x) !== 0);
}

/** Een expliciet nulresultaat is invoer. Bij totaalposten volstaat alleen omzet niet. */
export function heeftResultaatinvoer(jd = {}) {
  const agg = jd.bzi || {};
  return heeftResultaatDetail(jd) || heeftBedrag(agg.nettowinst)
    || (heeftBedrag(agg.resultaatVoorBelasting) && heeftBedrag(agg.vpb));
}

function heeftResultaatDetail(jd) {
  return heeftVW(jd.vw) || (!heeftAggVW(jd.bzi) && Object.entries(jd.vw || {}).some(([k, x]) =>
    k !== 'prognose' && k !== 'fte' && heeftBedrag(x)));
}

export function heeftResultaatVoorBelasting(jd = {}) {
  const agg = jd.bzi || {};
  return heeftResultaatDetail(jd) || heeftBedrag(agg.resultaatVoorBelasting)
    || (heeftBedrag(agg.nettowinst) && heeftBedrag(agg.vpb));
}

/** Alleen de actieve, meegetelde ondernemingsjaren bepalen of de NHG-bedragen onderbouwd zijn. */
export function nhgInkomenBeschikbaar(nhg) {
  if (!Number.isFinite(nhg?.toetsinkomen)) return false;
  if (!nhg.ondernemingen || !nhg.T) return true;
  const mee = nhg.ondernemingen.filter((a) => a.meenemen !== false && !a.geconsolideerd);
  return mee.length > 0 && mee.every((a) => nhg.T.every((y) => {
    const j = a.jaren?.[y];
    if (j?.actief === false || j?.meegeteld === false) return true;
    return a.soort === 'VPB'
      ? heeftBedrag(j?.ibOnd?.loon) || heeftBedrag(j?.vwRuw?.salarisDGA)
      : j?.heeftResultaatinvoer || heeftBedrag(j?.ibOnd?.sfw);
  }));
}

/** Diversen-post met terugval op een V&W-post wanneer de post leeg is gelaten. */
export function metTerugval(div = {}, key, terugval) {
  return isIngevuld(div[key]) ? num(div[key]) : num(terugval);
}

// ---------------------------------------------------------------------------
// Totaalposten (BZI-invoer). Zonder gedetailleerde balans of V&W kan per jaar direct met
// totalen worden gerekend: omzet, nettowinst (bij NHG: winst vóór belasting), eigen vermogen,
// balanstotaal, vlottende activa en kort vreemd vermogen. Zodra er detailposten zijn, gaan die voor.
// ---------------------------------------------------------------------------
export const AGG_BALANS = ['ev', 'bt', 'va', 'kvv'];
export const AGG_VW = ['omzet', 'nettowinst', 'resultaatVoorBelasting'];

/** Volledige totaalinvoer voorkomt dat een lege balanspost als nul aan een ratio meedoet. */
export function balansOntbreekt(jd = {}) {
  if (heeftBalans(jd.balans)) return [];
  return AGG_BALANS.filter((key) => !heeftBedrag(jd.bzi?.[key]));
}

export function voorraadTotaal(agg = {}) {
  if (heeftBedrag(agg.voorraad)) return num(agg.voorraad);
  return heeftBedrag(agg.vaDetail?.voorraden) ? num(agg.vaDetail.voorraden) : null;
}

export function heeftAggBalans(agg = {}) {
  return AGG_BALANS.some((k) => isIngevuld(agg[k]));
}

export function heeftAggVW(agg = {}) {
  return AGG_VW.some((k) => isIngevuld(agg[k]));
}

/**
 * Totalen van één jaar met terugval op de totaalposten.
 * @returns {{bal, vw, heeftBalans, heeftVW, aggBalans, aggVW}}
 */
export function totalenJaar(jd = {}) {
  const b = jd.balans || {};
  const w = jd.vw || {};
  const agg = jd.bzi || {};
  const detailB = heeftBalans(b);
  const detailW = heeftVW(w);
  const aggB = !detailB && heeftAggBalans(agg);
  const aggW = !detailW && heeftAggVW(agg);
  let bal;
  if (aggB) {
    const EV = num(agg.ev);
    const TA = num(agg.bt);
    const VA = num(agg.va);
    const KVV = num(agg.kvv);
    bal = { IVA: 0, MVA: 0, FVA: 0, VOORRADEN: voorraadTotaal(agg) ?? 0, VORDERINGEN: 0, VA, TA, EV, VZ: 0,
      LVV: TA - EV - KVV, KVV, TP: TA, VERSCHIL: 0, aggregaat: true };
  } else {
    bal = balansTotalen(b);
  }
  let vw;
  if (aggW) {
    const voorBelasting = heeftBedrag(agg.resultaatVoorBelasting);
    const netto = heeftBedrag(agg.nettowinst);
    const belasting = heeftBedrag(agg.vpb);
    const NW = netto ? num(agg.nettowinst) : voorBelasting && belasting ? num(agg.resultaatVoorBelasting) - num(agg.vpb) : 0;
    const RVB = voorBelasting ? num(agg.resultaatVoorBelasting) : NW + (netto && belasting ? num(agg.vpb) : 0);
    vw = { OMZET: num(agg.omzet), BRUTO: 0, AFSCHRIJVINGEN: 0, KOSTEN: 0, BEDRIJFSRESULTAAT: NW, FIN: 0,
      BUITENGEWOON: 0, RVB, NW, KOSTPRIJS: 0, aggregaat: true };
  } else {
    vw = vwTotalen(w);
  }
  return { bal, vw, heeftBalans: detailB || aggB, heeftVW: detailW || aggW, aggBalans: aggB, aggVW: aggW };
}
