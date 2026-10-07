import { soortOndernemer, RECHTSVORMEN } from './kaders.js';
import * as P from './periods.js';
import { totalenJaar, metTerugval } from './financieel.js';
import { WINST_CORRECTIES, VERMOGENS_CORRECTIES, getekend } from '../schema/correcties.js';
import { num, rond, rond2, gemiddelde, isIngevuld } from '../util.js';
import { Trace, cel, g, r, p, somF, lijstF, laagsteF } from './trace.js';

const AKK = 'akkoord';
const ATT = 'attentie';
const NOK = 'niet_akkoord';

export const STATUS_RANG = { akkoord: 0, nvt: 0, attentie: 1, niet_akkoord: 2 };

export function slechtste(statussen) {
  return statussen.reduce((a, b) => (STATUS_RANG[b] > STATUS_RANG[a] ? b : a), AKK);
}

const somL = (lijst) => lijst.reduce((a, b) => a + num(b.bedrag), 0);

// ---------------------------------------------------------------------------
// Balanscorrecties per kader
// ---------------------------------------------------------------------------
/**
 * Automatische correcties uit de detailbalans plus handmatige vermogenscorrecties (BZI-typen).
 * Een handmatige correctie van een type met `auto` vervangt de automatische correctie van dat jaar.
 * Naast de lijsten per grootheid levert de functie `items`: per correctie het effect op
 * aansprakelijk vermogen (av), balanstotaal (bt), vlottende activa (va) en kort vreemd vermogen (kvv).
 */
export function balansCorrecties(b = {}, div = {}, { kader, soort, beroepsgroep, detail = {} }, handmatig = []) {
  const v = (key) => num(b[key]);
  const dgaDetail = detail?.fvaDGA && (isIngevuld(detail.fvaDGA.nietHyp) || isIngevuld(detail.fvaDGA.hyp));
  const c = { vaNeg: [], vaPos: [], kvvNeg: [], kvvPos: [], evNeg: [], evPos: [], tvNeg: [], tvPos: [] };
  const items = new Map();
  const hand = (handmatig || []).filter((x) => num(x.bedrag) !== 0 && VERMOGENS_CORRECTIES[x.type]);
  const vervangen = new Set(hand.map((x) => VERMOGENS_CORRECTIES[x.type].auto).filter(Boolean));
  const effect = { evNeg: ['av', -1], evPos: ['av', 1], tvNeg: ['bt', -1], tvPos: ['bt', 1],
    vaNeg: ['va', -1], vaPos: ['va', 1], kvvNeg: ['kvv', 1], kvvPos: ['kvv', -1] };
  const add = (lijsten, key, label, bedrag, extra = {}) => {
    if (!bedrag) return;
    if (!extra.hand && vervangen.has(key)) return;
    const item = items.get(key) || { key, label, av: 0, bt: 0, va: 0, kvv: 0, hand: !!extra.hand, type: extra.type || null };
    lijsten.forEach((l) => {
      c[l].push({ key, label, bedrag, ...extra });
      const [gr, teken] = effect[l];
      item[gr] += teken * bedrag;
    });
    items.set(key, item);
  };
  const isVPB = soort === 'VPB';

  if (kader.id === 'NHG') {
    add(['evNeg', 'tvNeg'], 'iva', 'Immateriële vaste activa -/- goodwill behorend tot EV', v('ivaGoodwillNietEV') + v('ivaOverig'));
    if (isVPB) {
      const rc = v('vordDGAKort');
      if (rc >= kader.rcDrempel) add(['vaNeg', 'evNeg', 'tvNeg'], 'rc', 'Rekening-courant DGA (≥ € 17.500)', rc);
      // Een hypothecaire lening aan de DGA (eigen woning) geldt als gedekt; zonder onderverdeling
      // bepaalt de keuze "lening u/g aan DGA is gedekt" of de hele post wordt gecorrigeerd.
      if (!div.leningDGAGedekt) {
        if (dgaDetail) add(['evNeg', 'tvNeg'], 'leningDGA', 'Lening u/g aan DGA, niet-hypothecair deel', num(detail.fvaDGA.nietHyp));
        else add(['evNeg', 'tvNeg'], 'leningDGA', 'Lening u/g aan DGA (niet gedekt)', v('fvaDGA'));
      }
      add(['evPos'], 'odv', 'Pensioen in eigen beheer / oudedagsverplichting', v('vzODV'));
      add(['evPos'], 'stamrecht', 'Stamrechtvoorziening', v('vzStamrecht'));
      add(['evPos'], 'schuldDGA', 'Schulden aan DGA (terbeschikkingstelling)', v('llDGA') + v('klDGA'));
      add(['kvvPos'], 'schuldDGAKort', 'Kortlopende schuld aan DGA', v('klDGA'));
      add(['evPos'], 'schuldParticipanten', 'Schulden aan participanten en deelnemingen', v('klParticipanten'));
      add(['kvvPos'], 'schuldParticipantenKort', 'Kortlopende schuld participanten en deelnemingen', v('klParticipanten'));
    }
    add(['vaNeg', 'evNeg', 'tvNeg'], 'vordGroepKort', 'Vorderingen op groepsmaatschappijen (kort)', v('vordGroepKort'));
    add(['evNeg', 'tvNeg'], 'vordGroepLang', 'Vorderingen op groepsmaatschappijen (lang)', v('fvaGroep'));
    add(['evPos'], 'schuldGroep', 'Schulden aan groepsmaatschappijen', v('llGroep') + v('klGroep'));
    add(['kvvPos'], 'schuldGroepKort', 'Kortlopende schuld groepsmaatschappijen', v('klGroep'));
    add(['evPos'], 'latentPassief', 'Voorziening latente belastingen', v('vzLatenteBelasting'));
    add(['vaNeg'], 'latentActiefKort', 'Latente belastingvorderingen (kort)', v('vordLatenteBelasting'));
    add(['evNeg', 'tvNeg'], 'latentActief', 'Latente belastingvorderingen', v('vordLatenteBelasting') + v('fvaLatenteBelasting'));
    add(['evPos'], 'achtergesteld', 'Achtergestelde leningen', v('llAchtergesteld'));
    add(['evPos', 'tvPos'], 'stilleReserves', 'Stille reserve onroerend goed (100%)', num(div.stilleReserves));
    add(['vaPos', 'evPos', 'tvPos'], 'box3', 'Box 3 vermogen (ingezet bij deze onderneming)', num(div.box3Ingezet));
    add(['vaPos', 'evPos', 'tvPos'], 'surplusOntvangen', 'Surplus werkkapitaal ontvangen van groep', num(div.surplusOntvangen));
    add(['evPos'], 'overigPos', 'Overige positieve correctie eigen vermogen', num(div.balansOverigPositief));
  } else {
    const factor = kader.goodwillFactor(beroepsgroep);
    const goodwill = (v('ivaGoodwillEV') + v('ivaGoodwillNietEV')) * factor;
    const label = factor === 1 ? 'Immateriële vaste activa'
      : `Immateriële vaste activa (goodwill voor ${Math.round(factor * 100)}% gecorrigeerd)`;
    add(['evNeg', 'tvNeg'], 'iva', label, goodwill + v('ivaOverig'));
    if (isVPB) {
      add(['vaNeg', 'evNeg', 'tvNeg'], 'rc', 'Rekening-courant directie (activazijde)', v('vordDGAKort'));
      add(['evNeg', 'tvNeg'], 'leningDGA', 'Lening directie (activazijde)', v('fvaDGA'));
    }
  }
  add(['vaNeg'], 'gRekening', 'Liquide middelen niet ter vrije beschikking (G-rekening)', v('liquideNietVrij'));
  add(['vaNeg', 'evNeg', 'tvNeg'], 'dubieus', 'Dubieuze debiteuren zonder voorziening', num(div.dubieuzeDebiteuren));
  add(['vaNeg', 'evNeg', 'tvNeg'], 'surplusIngezet', 'Surplus werkkapitaal ingezet bij groep', num(div.surplusIngezet));
  add(['evNeg', 'tvNeg'], 'overigNeg', 'Overige negatieve correctie', num(div.balansOverigNegatief));

  // Handmatige vermogenscorrecties (types zoals in de rekentool van de bank)
  hand.forEach((x, i) => {
    const def = VERMOGENS_CORRECTIES[x.type];
    const e = getekend(x.type, x.bedrag, VERMOGENS_CORRECTIES);
    const lijsten = [e < 0 ? 'evNeg' : 'evPos'];
    if (def.effect.includes('bt')) lijsten.push(e < 0 ? 'tvNeg' : 'tvPos');
    if (def.effect.includes('va')) lijsten.push(e < 0 ? 'vaNeg' : 'vaPos');
    if (def.effect.includes('kvv')) lijsten.push(e < 0 ? 'kvvNeg' : 'kvvPos');
    add(lijsten, `hand_${x.type}_${i}`, def.label, Math.abs(e), { hand: true, type: x.type, toelichting: x.toelichting || '' });
  });
  c.items = [...items.values()];
  return c;
}

export function ratios(bt, corr) {
  const VAcor = bt.VA - somL(corr.vaNeg) + somL(corr.vaPos);
  const KVVcor = bt.KVV + somL(corr.kvvNeg) - somL(corr.kvvPos);
  const EVcor = bt.EV - somL(corr.evNeg) + somL(corr.evPos);
  const TVcor = bt.TA - somL(corr.tvNeg) + somL(corr.tvPos);
  const CR = KVVcor > 0 ? rond2(VAcor / KVVcor) : null;
  const QR = KVVcor > 0 ? rond2((VAcor - bt.VOORRADEN) / KVVcor) : null;
  const WK = VAcor - KVVcor;
  const SV = TVcor > 0 ? Math.round((EVcor / TVcor) * 10000) / 10000 : null;
  return { VAcor, KVVcor, EVcor, TVcor, CR, QR, WK, SV };
}

// ---------------------------------------------------------------------------
// NHG bandbreedtemodel solvabiliteit
// ---------------------------------------------------------------------------
export function bandbreedte(svVorig, svLaatst, svControle, bb) {
  if (svLaatst === null || svLaatst === undefined) {
    return { status: AKK, tekst: 'Geen balansposten: solvabiliteit niet van toepassing.' };
  }
  const { laag, norm, hoog, trend } = bb;
  const daling = (svVorig !== null && svVorig !== undefined && svVorig > 0) ? (svVorig - svLaatst) / svVorig : 0;
  const heeftC = svControle !== null && svControle !== undefined;
  if (heeftC && svControle < norm) {
    return { status: NOK, tekst: `Solvabiliteit in het controlejaar (${p(svControle)}) is lager dan ${p(norm)}.` };
  }
  if (svLaatst >= hoog) {
    return { status: AKK, tekst: `${p(svLaatst)} ligt boven de bandbreedte (≥ ${p(hoog)}).` };
  }
  if (svLaatst < laag) {
    return { status: NOK, tekst: `${p(svLaatst)} ligt onder de bandbreedte (< ${p(laag)}): geen bestendig inkomen.` };
  }
  if (svLaatst >= norm) {
    if (daling > trend) {
      if (!heeftC) {
        return { status: ATT, tussentijdsNodig: true,
          tekst: `Daling van ${p(daling)} (> 10%) binnen de bandbreedte: tussentijdse cijfers nodig om een trendbreuk aan te tonen (lopend jaar ≥ ${p(svLaatst)}).` };
      }
      return svControle >= svLaatst
        ? { status: AKK, tekst: `Trendbreuk aangetoond: lopend jaar ${p(svControle)} ≥ ${p(svLaatst)}.` }
        : { status: NOK, tekst: `Trend blijft dalend: lopend jaar ${p(svControle)} < ${p(svLaatst)}.` };
    }
    return { status: AKK, tekst: `${p(svLaatst)} ≥ ${p(norm)}, geen dalende trend van meer dan 10%.` };
  }
  // tussen 20% en 25%
  if (!heeftC) {
    const stijgend = svVorig !== null && svVorig !== undefined && svLaatst > svVorig;
    return { status: ATT, tussentijdsNodig: true,
      tekst: stijgend
        ? `Stijgende trend in de onderste bandbreedte (${p(svLaatst)}): tussentijdse cijfers met solvabiliteit ≥ ${p(norm)} nodig.`
        : `${p(svLaatst)} ligt onder ${p(norm)}: trendbreuk aantonen met tussentijdse cijfers (≥ ${p(norm)}).` };
  }
  return svControle >= norm
    ? { status: AKK, tekst: `Tussentijdse solvabiliteit ${p(svControle)} ≥ ${p(norm)}.` }
    : { status: NOK, tekst: `Tussentijdse solvabiliteit ${p(svControle)} < ${p(norm)}.` };
}

function trendLabel(waarden) {
  const v = waarden.filter((x) => x !== null && x !== undefined);
  if (v.length < 2) return 'Gelijk';
  const verschil = [];
  for (let i = 1; i < v.length; i += 1) verschil.push(Math.sign(Math.round((v[i] - v[i - 1]) * 100)));
  if (verschil.every((x) => x === 0)) return 'Gelijk';
  if (verschil.every((x) => x >= 0)) return 'Stijgend';
  if (verschil.every((x) => x <= 0)) return 'Dalend';
  return 'Wisselend';
}

function pctVerschil(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return null;
  if (a === 0) return b === 0 ? 0 : null;
  return (b - a) / Math.abs(a);
}

function pctUit(v, standaard = 100) {
  const x = isIngevuld(v) ? num(v) : standaard;
  return Math.min(1, Math.max(0, x / 100));
}

// ---------------------------------------------------------------------------
// Analyse van één onderneming
// ---------------------------------------------------------------------------
export function analyseerOnderneming(ond, ctx) {
  const { kader, T, C, datum, ib = {} } = ctx;
  const soort = soortOndernemer(ond.rechtsvorm);
  const isVPB = soort === 'VPB';
  const isEZ = ond.rechtsvorm === 'EZ';
  const aandeelBasis = isEZ ? 1 : pctUit(ond.aandeelPct);
  const aandeelVan = (jd) => (isEZ ? 1 : (isIngevuld(jd?.aandeelPct) ? pctUit(jd.aandeelPct) : aandeelBasis));
  const start = ond.startActiviteiten || ond.startdatum || '';
  const startY = start ? P.parseISO(start)?.y : null;
  const jaren = C ? [...T, C] : [...T];
  const T3 = T[2];
  const trace = new Trace();
  const kolLabels = {};
  jaren.forEach((y) => { kolLabels[y] = y === C ? `${y} (controlejaar)` : String(y); });
  const isDeelneming = !!ond.parentId;

  const res = {
    id: ond.id,
    naam: ond.naam || '(naamloos)',
    rechtsvorm: ond.rechtsvorm,
    rechtsvormLabel: RECHTSVORMEN[ond.rechtsvorm]?.label || ond.rechtsvorm,
    rechtsvormKort: RECHTSVORMEN[ond.rechtsvorm]?.kort || ond.rechtsvorm,
    soort,
    aandeel: aandeelVan(ond.jaren?.[T3] || ond.jaren?.[String(T3)] || {}),
    start,
    meenemen: ond.meenemen !== false,
    parentId: ond.parentId || null,
    extraParents: ond.extraParents || [],
    geconsolideerd: !!ond.geconsolideerd,
    branche: ond.branche || '',
    isDeelneming,
    duur: P.duur(start, datum),
    maandenTotT3: start ? P.maandenInclusief(start, `${T3}-12-31`) : 999,
    jaren: {},
    checks: [],
    trace,
    box2: null,
  };
  res.maandenOndernemer = res.duur.totaalMaanden;

  const svNorm = kader.id === 'NHG' ? kader.bandbreedte.norm : kader.solvabiliteitMin;

  // ---- per jaar -----------------------------------------------------------
  for (const y of jaren) {
    const jd = ond.jaren?.[y] || ond.jaren?.[String(y)] || {};
    const isC = y === C;
    const status = jd.status || (isC ? 'tussentijds' : 'definitief');
    const van = jd.van || (startY === y ? start : `${y}-01-01`);
    const tot = jd.tot || `${y}-12-31`;
    const factor = isC && status === 'tussentijds' ? P.extrapolatiefactor(van, tot) : 1;
    const balans = jd.balans || {};
    const vwRuw = jd.vw || {};
    const div = jd.div || {};
    const tj = totalenJaar(jd);
    const bt = tj.bal;
    const vt = tj.vw;
    const actief = !startY || y >= startY;
    // Meegeteld in de gemiddelden (BZI: vinkje per jaar). Het lopende jaar telt nooit mee.
    const meegeteld = actief && !isC && jd.meetellen !== false;
    const aY = aandeelVan(jd);
    const agg = jd.bzi || {};

    // Handmatige winstcorrecties (vervangen de automatische van hetzelfde type)
    const hand = (jd.winstCorrecties || [])
      .filter((c) => num(c.bedrag) !== 0 && WINST_CORRECTIES[c.type])
      .map((c) => ({ ...c, effect: getekend(c.type, c.bedrag, WINST_CORRECTIES) }));
    const handTypes = new Set(hand.map((c) => c.type));

    // Correcties op het resultaat (ondernemingsniveau)
    const incBaten = handTypes.has('incidenteleBaat') ? 0 : metTerugval(div, 'incidenteleBaten', vwRuw.bijzondereBaten);
    const incLastenRuw = handTypes.has('incidenteleLast') ? 0 : metTerugval(div, 'incidenteleLasten', vwRuw.bijzondereLasten);
    const incLasten = kader.id === 'NHG' && div.incidenteleLastenFiscaal === false ? 0 : incLastenRuw;
    const willekeurig = kader.id === 'NHG' ? num(div.willekeurigeAfschrijving) : 0;
    const cashflow = !handTypes.has('cashflow') && kader.cashflowCorrectie && !div.cashflowNietToepassen
      ? Math.max(0, num(div.aflossingenLVV) - vt.AFSCHRIJVINGEN) : 0;
    const deelneming = handTypes.has('resultaatDeelneming') ? 0 : num(div.correctieDeelneming);
    const overPos = num(div.overigePositief);
    const overNeg = num(div.overigeNegatief);
    const ibOnd = ib?.[y]?.perOnd?.[ond.id] || ib?.[String(y)]?.perOnd?.[ond.id] || {};
    const bijtelling = Math.abs(num(ibOnd.bijtelling));

    const winstPos = [];
    const winstNeg = [];
    if (incLasten) winstPos.push({ label: kader.id === 'NHG' ? 'Incidentele lasten (fiscaal van aard)' : 'Incidentele lasten', bedrag: incLasten, type: 'incidenteleLast' });
    if (willekeurig) winstPos.push({ label: 'Willekeurige afschrijving', bedrag: willekeurig });
    if (deelneming > 0) winstPos.push({ label: 'Correctie resultaat deelneming', bedrag: deelneming, type: 'resultaatDeelneming' });
    if (overPos) winstPos.push({ label: 'Overige positieve correctie', bedrag: overPos });
    if (incBaten) winstNeg.push({ label: 'Incidentele baten', bedrag: incBaten, type: 'incidenteleBaat' });
    if (cashflow) winstNeg.push({ label: 'Cashflowcorrectie (aflossing -/- afschrijving)', bedrag: cashflow, type: 'cashflow' });
    if (deelneming < 0) winstNeg.push({ label: 'Correctie resultaat deelneming', bedrag: -deelneming, type: 'resultaatDeelneming' });
    if (overNeg) winstNeg.push({ label: 'Overige negatieve correctie', bedrag: overNeg });
    hand.forEach((c) => {
      const item = { label: WINST_CORRECTIES[c.type].label, bedrag: Math.abs(c.effect), type: c.type, hand: true, toelichting: c.toelichting || '' };
      (c.effect > 0 ? winstPos : winstNeg).push(item);
    });

    // Winstgevendheid op commerciële basis (V&W). De bijtelling auto is een fiscale post en
    // wordt alleen op het box 1 inkomen (saldo fiscale winst / loon) gecorrigeerd.
    const RVBcor = vt.RVB + num(vwRuw.resultaatDeelnemingen) + somL(winstPos) - somL(winstNeg);
    const NWcor = vt.NW + somL(winstPos) - somL(winstNeg);

    // Balans. Bij totaalposten levert de samenstelling van de vlottende activa (indien ingevuld)
    // de R/C directie en de niet vrij beschikbare liquide middelen voor de automatische correcties.
    const corrBasis = tj.aggBalans
      ? { vordDGAKort: num(agg.vaDetail?.rcDirectie), liquideNietVrij: num(agg.vaDetail?.nietVrij) }
      : balans;
    const corr = balansCorrecties(corrBasis, div, { kader, soort, beroepsgroep: ond.beroepsgroep, detail: tj.aggBalans ? {} : jd.balansDetail },
      jd.vermogensCorrecties);
    const rt = ratios(bt, corr);
    const solvRuimte = tj.heeftBalans ? (rt.EVcor - svNorm * rt.TVcor) / (1 - svNorm) : null;
    const liqRuimte = tj.heeftBalans ? rt.VAcor - rt.KVVcor : null;

    // Box 1 inkomen uit deze onderneming
    const ink = { bron: '', basis: 0, pos: [], neg: [], totaal: 0 };
    if (!isVPB) {
      const sfwBeschikbaar = isIngevuld(ibOnd.sfw) && !(isC && status === 'tussentijds');
      if (sfwBeschikbaar) {
        ink.bron = 'SFW';
        ink.basis = num(ibOnd.sfw);
        const inv = kader.id === 'NHG' ? num(div.investeringsaftrek) : 0;
        const beperkt = kader.id === 'NHG' ? num(div.beperktAftrekbaar) : 0;
        if (inv) ink.pos.push({ label: 'Investeringsaftrek', bedrag: inv * aY });
        if (beperkt) ink.neg.push({ label: 'Beperkt / niet aftrekbare kosten', bedrag: beperkt * aY });
      } else {
        ink.bron = 'NW';
        ink.basis = vt.NW * aY;
      }
      winstPos.forEach((x) => ink.pos.push({ label: x.label, bedrag: x.bedrag * aY }));
      winstNeg.forEach((x) => ink.neg.push({ label: x.label, bedrag: x.bedrag * aY }));
      if (bijtelling) ink.neg.push({ label: 'Bijtelling privégebruik auto', bedrag: bijtelling });
    } else {
      if (isIngevuld(ibOnd.loon)) {
        ink.bron = 'LOON';
        ink.basis = num(ibOnd.loon);
      } else {
        ink.bron = 'SALARIS';
        ink.basis = num(vwRuw.salarisDGA);
      }
      const bijtellingMee = kader.bijtellingDGA === 'alle' || y === T3 || isC;
      if (bijtelling && bijtellingMee) ink.neg.push({ label: 'Bijtelling privégebruik auto', bedrag: bijtelling });
    }
    ink.totaal = ink.basis + somL(ink.pos) - somL(ink.neg);
    ink.extr = ink.totaal * factor;

    const omzetJaar = vt.OMZET * factor;
    const omlDeb = omzetJaar > 0 && num(balans.debiteuren) ? Math.round((num(balans.debiteuren) / omzetJaar) * 365) : null;
    const kostprijsJaar = vt.KOSTPRIJS * factor;
    const omlCred = kostprijsJaar > 0 ? Math.round((num(balans.klCrediteuren) / kostprijsJaar) * 365) : null;

    // Geldstromen binnen de structuur (BZI: management fee en intern dividend naar de aandeelhouder)
    res.jaren[y] = {
      y, isC, status, van, tot, factor, actief, meegeteld, aandeel: aY,
      heeftBalans: tj.heeftBalans, heeftVW: tj.heeftVW, aggBalans: tj.aggBalans, aggVW: tj.aggVW,
      balans, vwRuw, div, bal: bt, vw: vt,
      winst: { NW: vt.NW, RVB: vt.RVB, pos: winstPos, neg: winstNeg, NWcor, RVBcor, NWcorExtr: NWcor * factor },
      corr, ...rt, solvRuimte, liqRuimte,
      inkomen: ink,
      ibOnd,
      omlDeb, omlCred,
      geldstroom: {
        managementFee: num(agg.managementFee),
        internDividend: num(agg.internDividend),
        ontvangenFee: jd.geldstromen?.ontvangenFee || {},
        ontvangenDividend: jd.geldstromen?.ontvangenDividend || {},
        nogTeOntvangenDividend: isIngevuld(jd.geldstromen?.nogTeOntvangenDividend)
          ? num(jd.geldstromen.nogTeOntvangenDividend) : num(jd.balansDetail?.vordOverig?.dividend),
        dividendDGA: jd.geldstromen?.dividendDGA,
      },
    };
  }

  const J = res.jaren;
  const laatsteBalansJaar = C && J[C]?.heeftBalans ? C : T3;
  res.laatsteBalansJaar = laatsteBalansJaar;
  const gem = (fn) => {
    const v = T.map((y) => (J[y]?.heeftBalans && J[y].meegeteld ? fn(J[y]) : null)).filter((x) => x !== null && x !== undefined);
    return v.length ? gemiddelde(v) : null;
  };
  const mee = T.filter((y) => J[y]?.meegeteld);
  res.meegeteldeJaren = mee;
  res.gemiddeld = {
    solvRuimte: gem((j) => j.solvRuimte),
    liqRuimte: gem((j) => j.liqRuimte),
    omzet: gemiddelde(mee.map((y) => J[y].vw.OMZET)),
    winst: gemiddelde(mee.map((y) => J[y].winst.NWcor)),
    internDividend: gemiddelde(mee.map((y) => J[y].geldstroom.internDividend)),
    managementFee: gemiddelde(mee.map((y) => J[y].geldstroom.managementFee)),
  };

  // ---- voorwaarden ----------------------------------------------------------
  const checks = res.checks;
  const add = (key, label, status, tekst) => checks.push({ key, label, status, tekst });
  const minMaanden = kader.minMaandenKvK;
  if (ctx.soort !== 'NUL') {
    const ok = res.maandenOndernemer >= minMaanden;
    add('duur', 'Duur bestaan onderneming',
      ok ? AKK : (isDeelneming ? ATT : NOK),
      `${P.tekstDuur(res.duur)} sinds ${start ? start.split('-').reverse().join('-') : 'onbekend'} (minimaal ${minMaanden} maanden${isDeelneming ? '; deelneming: beoordeel de bestendigheid' : ''}).`);
  }

  // Definitieve cijfers laatste toetsjaar
  const defVerplicht = P.opOfNa(datum, kader.definitiefVerplichtVanaf.m, kader.definitiefVerplichtVanaf.d)
    ? ctx.jaarNu - 1 : ctx.jaarNu - 2;
  if (ctx.soort !== 'NUL') {
    if (T3 < defVerplicht) {
      add('definitief', 'Definitieve jaarcijfers', NOK,
        `Vanaf ${kader.definitiefVerplichtVanaf.d}/${kader.definitiefVerplichtVanaf.m} zijn definitieve cijfers over ${defVerplicht} verplicht; het laatste toetsjaar is ${T3}.`);
    } else if (J[T3] && J[T3].status !== 'definitief' && T3 <= defVerplicht) {
      add('definitief', 'Definitieve jaarcijfers', ATT, `De cijfers over ${T3} zijn nog niet definitief (${J[T3].status}).`);
    } else {
      add('definitief', 'Definitieve jaarcijfers', AKK, `Laatste toetsjaar ${T3}.`);
    }
    const ttVerplicht = P.opOfNa(datum, kader.tussentijdsVerplichtVanaf.m, kader.tussentijdsVerplichtVanaf.d)
      && T3 === ctx.jaarNu - 1 && ond.actief !== false;
    if (ttVerplicht && !(C && J[C]?.heeftVW)) {
      add('tussentijds', 'Tussentijdse cijfers lopend jaar', ATT,
        `Vanaf 1/8 is een tussentijdse winst- en verliesrekening over ${ctx.jaarNu} verplicht.`);
    } else if (C && J[C]?.heeftVW) {
      const pv = P.volledigeMaanden(J[C].van, J[C].tot);
      add('tussentijds', 'Tussentijdse cijfers lopend jaar', pv || kader.id !== 'NHG' ? AKK : ATT,
        `Periode ${J[C].van.split('-').reverse().join('-')} t/m ${J[C].tot.split('-').reverse().join('-')}, extrapolatiefactor ${String(J[C].factor).replace('.', ',')}${pv ? '' : ' (geen hele maanden)'}.`);
    }
  }

  // Kort (eerste) boekjaar: de cijfers worden niet herleid naar 12 maanden.
  T.forEach((y) => {
    const j = J[y];
    if (!j || !(j.heeftVW || j.heeftBalans) || !j.van || !j.tot) return;
    const mnd = P.maandenInclusief(j.van, j.tot);
    if (mnd > 0 && mnd < 11.5) {
      add(`kort${y}`, `Boekjaar ${y} korter dan 12 maanden`, ATT,
        `${y} beslaat ${String(Math.round(mnd * 10) / 10).replace('.', ',')} maanden (${j.van.split('-').reverse().join('-')} t/m ${j.tot.split('-').reverse().join('-')}); de cijfers zijn niet herleid naar 12 maanden. ${j.meegeteld ? 'Beoordeel of het jaar mag meetellen in het gemiddelde.' : 'Het jaar telt niet mee in het gemiddelde.'}`);
    }
  });

  // Winstgevendheid
  if (kader.id === 'NHG') {
    const w3 = J[T3]?.winst.NWcor ?? 0;
    const wC = C ? J[C]?.winst.NWcorExtr : null;
    const ok = w3 >= 0 && (wC === null || wC === undefined || wC >= 0);
    add('winst', 'Winstgevendheid', ok ? AKK : NOK,
      `Nettowinst na correcties ${T3}: ${g(w3)}${C ? `; controlejaar (geëxtrapoleerd): ${g(wC)}` : ''} (minimaal laatste boekjaar positief).`);
  } else {
    const basis = (y) => (isVPB ? J[y]?.winst.NW : J[y]?.inkomen.basis) ?? 0;
    const beschikbaar = T.filter((y) => !startY || y >= startY);
    const laatstePos = basis(T3) > 0;
    const eerder = beschikbaar.filter((y) => y !== T3);
    const eerderPos = eerder.length === 0 || eerder.some((y) => basis(y) > 0);
    add('winst', isVPB ? 'Positief netto resultaat' : 'Positief saldo fiscale winst',
      laatstePos && eerderPos ? AKK : NOK,
      `${T3}: ${g(basis(T3))}; ${eerder.length ? `eerdere jaren: ${eerder.map((y) => `${y} ${g(basis(y))}`).join(', ')}` : 'geen eerdere boekjaren'} (laatste jaar én een van de twee voorgaande jaren positief).`);
  }

  // Liquiditeit
  const crMin = kader.liquiditeitMin;
  const crT3 = J[T3]?.CR ?? null;
  const crC = C && J[C]?.heeftBalans ? J[C].CR : null;
  if (kader.id === 'NHG') {
    const ok = (crT3 === null || crT3 >= crMin) && (crC === null || crC >= crMin);
    add('liquiditeit', 'Liquiditeit (current ratio)', ok ? AKK : NOK,
      `${T3}: ${crT3 === null ? 'n.v.t. (geen kortlopende schulden)' : r(crT3)}${crC !== null ? `; controlejaar: ${r(crC)}` : ''} (norm ≥ ${r(crMin)} na correcties).`);
  } else {
    const lr = res.gemiddeld.liqRuimte;
    const ok = crT3 === null || crT3 >= crMin || (lr !== null && lr >= 0);
    add('liquiditeit', 'Liquiditeit', ok ? AKK : NOK,
      `${T3}: ${crT3 === null ? 'n.v.t.' : r(crT3)}${lr !== null ? `; gemiddelde liquiditeitsruimte 3 jaar ${g(lr)}` : ''} (richtlijn ≥ ${r(crMin)} in het laatste jaar of gemiddeld over 3 jaar${isVPB ? '; vlottende activa minus R/C directie' : ''}).`);
  }
  add('werkkapitaal', 'Werkkapitaal', (J[laatsteBalansJaar]?.WK ?? 0) >= 0 || !J[laatsteBalansJaar]?.heeftBalans ? AKK : ATT,
    `${laatsteBalansJaar}: ${g(J[laatsteBalansJaar]?.WK ?? 0)}.`);

  // Solvabiliteit
  if (kader.id === 'NHG') {
    const T2 = T[1];
    const svC = C && J[C]?.heeftBalans ? J[C].SV : null;
    const bb = bandbreedte(J[T2]?.SV ?? null, J[T3]?.SV ?? null, svC, kader.bandbreedte);
    add('solvabiliteit', 'Solvabiliteit (bandbreedtemodel)', bb.status, bb.tekst);
    res.bandbreedte = bb;
  } else {
    const sv3 = J[T3]?.SV ?? null;
    const sr = res.gemiddeld.solvRuimte;
    const min = kader.solvabiliteitMin;
    const ok = sv3 === null || sv3 >= min || (sr !== null && sr >= 0);
    add('solvabiliteit', 'Solvabiliteit', ok ? AKK : NOK,
      `${T3}: ${sv3 === null ? 'n.v.t.' : p(sv3)}${sr !== null ? `; gemiddelde solvabiliteitsruimte 3 jaar ${g(sr)}` : ''} (richtlijn ≥ ${p(min)} in het laatste jaar of gemiddeld over 3 jaar).`);
  }

  // Buitenland
  const land = ond.land || 'NL';
  const toegestaan = kader.id === 'ABN' ? ['NL', 'BE', 'DE', 'LU'] : ['NL'];
  const blOk = toegestaan.includes(land) && (kader.id === 'ABN' || (ond.belastingplichtig || 'NL') === 'NL')
    && (kader.id === 'ABN' || ond.rechtNL !== false);
  add('buitenland', 'Buitenland', blOk ? AKK : NOK,
    kader.id === 'ABN' ? `Gevestigd in ${land} (toegestaan: NL, BE, DE, LU).`
      : `Gevestigd in ${land}, belastingplichtig in ${ond.belastingplichtig || 'NL'}, ${ond.rechtNL === false ? 'buitenlandse' : 'Nederlandse'} rechtsvorm.`);

  // Branche (SBI) en kasgeld
  const sbi = String(ond.sbi || '').trim();
  const sbi45 = /(^|\n)\s*45/.test(sbi);
  res.sbi45 = sbi45;
  if (sbi45 && !ond.kasgeld) add('branche', 'Branche / sector', ATT, 'SBI-code begint met 45: beantwoord de vraag of de onderneming kasgeld heeft.');
  else add('branche', 'Branche / sector', AKK, sbi ? sbi.split('\n')[0] : (ond.branche || 'Geen SBI-code vastgelegd.'));

  // Specifiek per soort/kader (belang van een deelneming wordt op structuurniveau getoetst)
  if (isVPB && !isDeelneming) {
    if (kader.id === 'ABN' && res.aandeel < kader.dgaMinBelang) {
      add('belang', 'Belang DGA', NOK, `Belang ${p(res.aandeel)} is lager dan 20% (direct of indirect).`);
    } else if (kader.id === 'NHG' && res.aandeel < 0.05) {
      add('belang', 'Belang DGA', NOK, `Belang ${p(res.aandeel)} is lager dan 5%: geen niet-IB ondernemer.`);
    } else {
      add('belang', 'Belang DGA', AKK, `${p(res.aandeel)} ${ond.direct === false ? 'indirect' : 'direct'}.`);
    }
  }
  if (kader.id === 'ABN' && ['medisch_juridisch', 'fysiotherapeut'].includes(ond.beroepsgroep)) {
    add('beroepsregister', 'Beroepsregister', ond.registerGecontroleerd ? AKK : ATT,
      ond.registerGecontroleerd ? 'Inschrijving gecontroleerd, geen tucht- of strafrechtelijke maatregel.'
        : 'Controleer de inschrijving in het BIG-, NBA-, NOvA- of KNB-register.');
  }
  if (kader.id === 'ABN') {
    const positief = jaren.flatMap((y) => (ond.jaren?.[y]?.vermogensCorrecties || []))
      .filter((x) => num(x.bedrag) !== 0 && VERMOGENS_CORRECTIES[x.type]?.alleenNHG);
    if (positief.length) {
      add('correcties', 'Positieve vermogenscorrecties', ATT,
        `${[...new Set(positief.map((x) => VERMOGENS_CORRECTIES[x.type].label))].join(', ')}: volgens de werkinstructie alleen voor dossiers met NHG. Motiveer of verwijder.`);
    }
  }

  // Balans in evenwicht
  jaren.forEach((y) => {
    const v = J[y]?.bal.VERSCHIL ?? 0;
    if (J[y]?.heeftBalans && Math.abs(v) > 1) {
      add(`balans${y}`, `Balans ${y} sluit niet`, ATT, `Verschil activa en passiva: ${g(v)}.`);
    }
  });

  // ---- trends --------------------------------------------------------------
  const reeks = (fn) => jaren.map((y) => fn(J[y], y));
  res.trends = {
    winst: reeks((j, y) => (y === C ? j.winst.NWcorExtr : j.winst.NWcor)),
    cr: reeks((j) => j.CR),
    wk: reeks((j) => (j.heeftBalans ? j.WK : null)),
    sv: reeks((j) => j.SV),
  };
  res.trendLabels = Object.fromEntries(Object.entries(res.trends).map(([k, v]) => [k, trendLabel(v)]));
  res.trendPct = Object.fromEntries(Object.entries(res.trends).map(([k, v]) => [k, v.map((x, i) => (i === 0 ? null : pctVerschil(v[i - 1], x)))]));

  // ---- maximaal te onttrekken en benodigd box 3 ------------------------------
  const L = J[laatsteBalansJaar];
  if (L) {
    const xCr = L.KVVcor > 0 ? L.VAcor - crMin * L.KVVcor : L.VAcor;
    const xSv = (L.EVcor - svNorm * L.TVcor) / (1 - svNorm);
    const xWk = L.VAcor - L.KVVcor;
    res.maxOnttrekken = L.heeftBalans ? Math.max(0, rond(Math.min(xCr, xSv, xWk, L.VAcor))) : 0;
    const nodigCr = L.KVVcor > 0 ? Math.max(0, crMin * L.KVVcor - L.VAcor) : 0;
    const nodigSv = L.TVcor > 0 || L.EVcor < 0 ? Math.max(0, (svNorm * L.TVcor - L.EVcor) / (1 - svNorm)) : 0;
    res.benodigdBox3 = L.heeftBalans ? rond(Math.max(nodigCr, nodigSv)) : 0;
    res.benodigdBox3Detail = { nodigCr: rond(nodigCr), nodigSv: rond(nodigSv), svMin: svNorm, crMin };
  }

  res.status = slechtste(checks.map((c) => c.status));
  bouwTraceOnderneming(res, ctx, kolLabels);
  return res;
}

// ---------------------------------------------------------------------------
// Overwinst en dubbele balanstoets (alleen VPB)
// ---------------------------------------------------------------------------
// Als overwinst (niet-uitgekeerde winst) tot het inkomen wordt gerekend, gaan we ervan uit dat
// die als dividend uitgekeerd had kunnen worden. Met de dubbele balanstoets stellen we daarom ook
// een balans op waarin de overwinst fictief is onttrokken aan het eigen vermogen, het
// balanstotaal en de vlottende activa, en toetsen we of de onderneming daarna nog aan de normen
// voor solvabiliteit en liquiditeit voldoet. Voldoet zij niet, dan wordt de overwinst verlaagd tot
// het bedrag waarbij de normen nog worden gehaald.
export const DBT_STANDAARD = {
  // NHG toetskader route 2: gemiddelde liquiditeitsruimte max. laatste jaar en solvabiliteit laatste jaar.
  NHG: { solvNorm: 0.25, liqMethode: 'werkkapitaal', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: false, vast: true },
  // Woonbeleid 3.63: solvabiliteit (≥ 20%) en liquiditeit (≥ 1) na uitkering (uitkeringstest).
  ABN: { solvNorm: 0.20, liqMethode: 'cr', crNorm: 1, jaren: 'laatste', cumulatief: false, controlejaar: true, vast: false },
};

export const DBT_KEUZES = {
  solvNorm: { 0.15: 'Solvabiliteit ≥ 15%', 0.2: 'Solvabiliteit ≥ 20%', 0.25: 'Solvabiliteit ≥ 25%' },
  liqMethode: { cr: 'Current ratio ≥ 1 na onttrekking', werkkapitaal: 'Gemiddeld werkkapitaal, max. laatste jaar' },
  jaren: { laatste: 'Laatste toetsjaar', alle: 'Alle toetsjaren' },
};

/** Instellingen van de dubbele balanstoets: standaard per kader; bij ABN AMRO aan te passen per hoofdbedrijf. */
export function dbtOpties(kader, keuzes = {}) {
  const o = { ...(DBT_STANDAARD[kader.id] || DBT_STANDAARD.ABN) };
  if (o.vast) return o;
  const sv = Number(keuzes.solvNorm);
  if ([0.15, 0.2, 0.25].includes(sv)) o.solvNorm = sv;
  if (DBT_KEUZES.liqMethode[keuzes.liqMethode]) o.liqMethode = keuzes.liqMethode;
  if (DBT_KEUZES.jaren[keuzes.jaren]) o.jaren = keuzes.jaren;
  if (typeof keuzes.cumulatief === 'boolean') o.cumulatief = keuzes.cumulatief;
  if (typeof keuzes.controlejaar === 'boolean') o.controlejaar = keuzes.controlejaar;
  return o;
}

const pct0 = (x) => `${Math.round(x * 1000) / 10}%`.replace('.', ',');

export function dbtOmschrijving(o) {
  const delen = [`solvabiliteit ≥ ${pct0(o.solvNorm)} na fictieve onttrekking`,
    o.liqMethode === 'werkkapitaal' ? 'liquiditeit: maximaal het gemiddelde werkkapitaal, met als maximum het werkkapitaal in het laatste jaar'
      : `liquiditeit: current ratio ≥ ${String(o.crNorm).replace('.', ',')} na fictieve onttrekking`,
    o.jaren === 'alle' ? 'getoetst in alle toetsjaren' : 'getoetst in het laatste toetsjaar'];
  if (o.controlejaar) delen.push('en in het controlejaar als daar een balans van is');
  if (o.cumulatief) delen.push('rekening houdend met de fictieve onttrekkingen in eerdere jaren');
  return delen.join('; ');
}

/**
 * Dubbele balanstoets. Geeft per getoetst jaar het maximum dat (per jaar) onttrokken kan worden.
 * Bij `cumulatief` telt in toetsjaar i de onttrekking van alle eerdere toetsjaren mee (i × overwinst).
 */
export function dubbeleBalanstoets(res, { T, C }, o) {
  const J = res.jaren;
  const T3 = T[T.length - 1];
  const metBalans = T.filter((y) => J[y]?.heeftBalans);
  let jaren = o.jaren === 'alle' ? metBalans : (J[T3]?.heeftBalans ? [T3] : []);
  if (o.controlejaar && C && J[C]?.heeftBalans) jaren = [...jaren, C];
  const k = (y) => (o.cumulatief ? (y === C ? T.length : T.indexOf(y) + 1) : 1);
  const perJaar = {};
  jaren.forEach((y) => {
    const j = J[y];
    const kk = k(y);
    perJaar[y] = {
      k: kk, EVcor: j.EVcor, TVcor: j.TVcor, VAcor: j.VAcor, KVVcor: j.KVVcor, WK: j.WK,
      maxSolv: rond((j.EVcor - o.solvNorm * j.TVcor) / ((1 - o.solvNorm) * kk)),
      maxCr: rond((j.KVVcor > 0 ? j.VAcor - o.crNorm * j.KVVcor : j.VAcor) / kk),
    };
  });
  const wk = metBalans.map((y) => J[y].WK / k(y));
  const gemWk = wk.length ? rond(gemiddelde(wk)) : null;
  const wkLaatst = J[T3]?.heeftBalans ? rond(J[T3].WK / k(T3)) : null;
  const wkC = o.controlejaar && C && J[C]?.heeftBalans ? rond(J[C].WK / k(C)) : null;
  let maxLiq = null;
  if (o.liqMethode === 'werkkapitaal') {
    const grenzen = [gemWk, wkLaatst, wkC].filter((x) => x !== null);
    maxLiq = grenzen.length ? Math.min(...grenzen) : null;
  } else if (jaren.length) {
    maxLiq = Math.min(...jaren.map((y) => perJaar[y].maxCr));
  }
  const maxSolv = jaren.length ? Math.min(...jaren.map((y) => perJaar[y].maxSolv)) : null;
  const max = maxSolv === null || maxLiq === null ? 0 : Math.max(0, Math.min(maxSolv, maxLiq));
  return { opties: o, jaren, perJaar, gemWk, nWk: wk.length, wkLaatst, wkC, maxSolv, maxLiq, max, k: Object.fromEntries(jaren.map((y) => [y, k(y)])) };
}

/** Balans na fictieve onttrekking van een bedrag (per jaar: bedrag × k). */
export function naOnttrekking(rij, bedrag) {
  const x = bedrag * (rij.k || 1);
  const EV = rij.EVcor - x;
  const TV = rij.TVcor - x;
  const VA = rij.VAcor - x;
  return { onttrokken: x, EV, TV, VA, KVV: rij.KVVcor, SV: TV > 0 ? Math.round((EV / TV) * 10000) / 10000 : null,
    CR: rij.KVVcor > 0 ? rond2(VA / rij.KVVcor) : null, WK: VA - rij.KVVcor };
}

/**
 * Overwinst (niet-uitgekeerde winst) en de mee te nemen overwinst na de dubbele balanstoets.
 * NHG (route 2): winst vóór belasting na correcties -/- dividenduitkering; gemiddelde, max. laatste jaar;
 *   dubbele balanstoets; × belang × 75%. Voorwaarden: > 50% (of aangetoonde) zeggenschap, ≥ 36 maanden,
 *   winst in het laatste en een van de voorgaande jaren.
 * ABN AMRO (3.63, niet-uitgekeerd dividend): nettowinst na correcties -/- uitgekeerd dividend; laagste van
 *   gemiddelde en laatste jaar; uitkeringstest (dubbele balanstoets) en balanstest (vrij uitkeerbare
 *   reserves); × belang. Voorwaarden: zelfstandig bevoegd (100% of aangetoond), ≥ 3 boekjaren, winst in
 *   het laatste jaar en een onderbouwde vrije kasstroom.
 */
export function berekenOverwinst(res, ond, ctx, keuzes = {}) {
  const { T, C, kader } = ctx;
  const J = res.jaren;
  const T3 = T[T.length - 1];
  const isNHG = kader.id === 'NHG';
  const o = dbtOpties(kader, keuzes);
  const winst = (y) => (isNHG ? J[y]?.winst.RVBcor : J[y]?.winst.NWcor) ?? 0;
  // Dividenduitkering ten laste van het boekjaar (Diversen). Niet ingevuld: terugval op het box 2-dividend
  // van de aanvrager in dat jaar, herleid naar de hele vennootschap (gedeeld door het belang).
  const uitkering = (y) => {
    const d = J[y]?.div?.dividenduitkering;
    if (isIngevuld(d)) return num(d);
    const box2 = num(J[y]?.ibOnd?.dividend);
    return box2 && res.aandeel > 0 ? rond(box2 / res.aandeel) : 0;
  };
  const jarenAlle = C && J[C]?.heeftVW ? [...T, C] : [...T];
  const ow = {};
  jarenAlle.forEach((y) => {
    const w = winst(y) * (y === C ? J[y].factor : 1);
    ow[y] = Math.max(0, rond(w - Math.min(Math.max(0, w), uitkering(y))));
  });
  const mee = T.filter((y) => J[y] && (isNHG || J[y].meegeteld));
  const reeks = mee.map((y) => ow[y]);
  const gem = reeks.length ? rond(gemiddelde(reeks)) : 0;
  const basis = Math.max(0, Math.min(gem, ow[T3] ?? 0));
  const owC = C && J[C]?.heeftVW ? ow[C] : null;
  const dbt = dubbeleBalanstoets(res, ctx, o);

  // Balanstest (ABN AMRO): vrij uitkeerbare reserves in de meest recente balans.
  let vrij = null;
  let vrijLabel = '';
  if (!isNHG) {
    const yL = dbt.jaren.includes(C) ? C : T3;
    const L = J[yL];
    if (L?.heeftBalans) {
      // Niet uitkeerbaar: geplaatst kapitaal, herwaarderingsreserve en wettelijke/statutaire reserves.
      const det = (ond.jaren?.[yL] || ond.jaren?.[String(yL)] || {}).balansDetail?.evOverig || {};
      const nietVrij = num(det.herwaardering) + num(det.wettelijk);
      vrij = L.aggBalans ? Math.max(0, rond(L.EVcor))
        : Math.max(0, rond(num(L.balans.evAgio) + num(L.balans.evWinstreserve) + num(L.balans.evOverig) - nietVrij));
      vrijLabel = L.aggBalans ? `aansprakelijk vermogen ${yL} (benadering, geen detailbalans)`
        : `agio, winstreserve en overige reserves ${yL}${nietVrij ? ', zonder herwaarderings- en wettelijke reserves' : ''}`;
    }
  }
  const grenzen = [basis, dbt.max];
  if (owC !== null) grenzen.push(owC);
  if (vrij !== null) grenzen.push(vrij);
  const naDbt = Math.max(0, Math.min(...grenzen));
  const afslag = isNHG ? kader.box2.afslag : 0;
  const bruto = rond(naDbt * res.aandeel * (1 - afslag));

  // Voorwaarden
  const voorwaarden = [];
  const vw = (label, ok, tekst) => voorwaarden.push({ label, status: ok ? 'akkoord' : 'niet_akkoord', tekst });
  const zeggenschap = isNHG ? (res.aandeel > 0.5 || ond.zeggenschap === true) : (res.aandeel >= 1 || ond.zeggenschap === true);
  vw('Zelfstandig bevoegd om dividend uit te keren', zeggenschap,
    `Belang ${pct0(res.aandeel)}${ond.zeggenschap ? ', zeggenschap aangetoond' : ''} (${isNHG ? '> 50% of aangetoond' : '100% of aangetoond, bijvoorbeeld met een vast dividendbeleid'}).`);
  const maanden = isNHG ? res.maandenOndernemer : res.maandenTotT3;
  vw(isNHG ? 'Minimaal 36 maanden ondernemer' : 'Minimaal 3 boekjaren ondernemer', maanden >= kader.box2.minMaanden,
    `${String(Math.floor(maanden)).replace('.', ',')} maanden.`);
  const winstOk = isNHG ? winst(T3) > 0 && T.slice(0, -1).some((y) => winst(y) > 0) : winst(T3) > 0;
  vw(isNHG ? 'Winst in het laatste en een van de voorgaande jaren' : 'Winst in het laatste boekjaar', winstOk,
    T.map((y) => `${y}: ${g(winst(y))}`).join(', '));
  if (!isNHG) {
    vw('Vrije kasstroom voldoende en onderbouwd', !!keuzes.kasstroomBevestigd,
      keuzes.kasstroomBevestigd ? 'Bevestigd: de vrije kasstroom draagt de uitkering duurzaam en de investerings- en financieringsbehoefte komt niet in gevaar.'
        : 'Nog niet bevestigd: onderbouw de vrije kasstroom, de buffers en de investeringsbehoefte.');
  }
  const toegestaan = voorwaarden.every((x) => x.status === 'akkoord');
  const bedrag = toegestaan ? bruto : 0;

  // Benodigde balansversterking (indicatief) om de volledige overwinst (basis) door de toets te krijgen:
  // een storting in de meest recente balans verhoogt EV, balanstotaal en vlottende activa met hetzelfde
  // bedrag, en het gemiddelde werkkapitaal met dat bedrag gedeeld door het aantal jaren in het gemiddelde.
  let benodigd = 0;
  if (basis > 0 && dbt.jaren.length) {
    const nodigSolv = Math.max(0, basis - (dbt.maxSolv ?? 0));
    const nodigLiq = o.liqMethode === 'werkkapitaal'
      ? Math.max(0, (dbt.nWk || 1) * (basis - (dbt.gemWk ?? 0)), basis - (dbt.wkLaatst ?? 0))
      : Math.max(0, basis - (dbt.maxLiq ?? 0));
    benodigd = rond(Math.max(nodigSolv, nodigLiq));
  }

  const uit = {
    opties: o, omschrijving: dbtOmschrijving(o), winstLabel: isNHG ? 'Winst vóór belasting na correcties' : 'Nettowinst na correcties',
    // Winst per jaar zoals gebruikt voor de overwinst: in het controlejaar geëxtrapoleerd naar 12 maanden.
    winst: Object.fromEntries(jarenAlle.map((y) => [y, rond(winst(y) * (y === C ? J[y].factor : 1))])), uitkering: Object.fromEntries(jarenAlle.map((y) => [y, uitkering(y)])),
    ow, mee, gem, basis, owC, dbt, vrij, vrijLabel, naDbt, afslag, aandeel: res.aandeel, bruto, bedrag, toegestaan, voorwaarden, benodigd,
  };
  traceOverwinst(res, uit, ctx);
  return uit;
}

function traceOverwinst(res, x, { T, C, kader }) {
  const jaren = Object.keys(x.ow).map(Number);
  const tr = res.trace.sectie('Overwinst (niet-uitgekeerde winst) per jaar', {
    groep: 'inkomen', kolommen: jaren, kolomLabels: Object.fromEntries(jaren.map((y) => [y, y === C ? `${y} (controlejaar, geëxtrapoleerd)` : String(y)])),
    richtlijn: kader.id === 'NHG'
      ? 'NHG route 2: gemiddelde winst vóór belasting na correcties -/- dividenduitkering over 3 jaar, maximaal het laatste jaar; dubbele balanstoets; uitkomst × belang met een afslag van 25%.'
      : 'Woonbeleid 3.63 (niet-uitgekeerd dividend): laagste van de gemiddelde nettowinst en de nettowinst van het laatste boekjaar, na uitkering voldoen aan solvabiliteit en liquiditeit (uitkeringstest) en de balanstest.',
  });
  tr.rij(x.winstLabel, Object.fromEntries(jaren.map((y) => [y, cel(x.winst[y])])));
  tr.rij('Dividenduitkering boekjaar', Object.fromEntries(jaren.map((y) => [y, cel(x.uitkering[y])])));
  tr.rij('Overwinst per jaar', Object.fromEntries(jaren.map((y) => [y, cel(x.ow[y], `${g(x.winst[y])} - ${g(Math.min(Math.max(0, x.winst[y]), x.uitkering[y]))} =`)])), { stijl: 'som' });
  const T3 = T[T.length - 1];
  tr.rij('Gemiddelde overwinst, maximaal laatste jaar', { [T3]: cel(x.basis, `${lijstF(x.mee.map((y) => x.ow[y]), x.mee.length || 1)} ${g(x.gem)}; ${laagsteF([x.gem, x.ow[T3] ?? 0])}`) }, { stijl: 'resultaat' });

  const d = x.dbt;
  const s = res.trace.sectie('Controle dubbele balanstoets overwinst', {
    groep: 'inkomen', kolommen: d.jaren, kolomLabels: Object.fromEntries(d.jaren.map((y) => [y, y === C ? `${y} (controlejaar)` : String(y)])),
    richtlijn: `Dubbele balanstoets: ${x.omschrijving}.`,
    formule: 'Maximale overwinst solvabiliteit: (aansprakelijk vermogen - norm × balanstotaal) / (1 - norm); liquiditeit: vlottende activa - norm × kort vreemd vermogen (of het werkkapitaal).',
  });
  if (d.jaren.length) {
    const rij = (label, fn, extra) => s.rij(label, Object.fromEntries(d.jaren.map((y) => [y, fn(d.perJaar[y], y)])), extra);
    if (d.opties.cumulatief) rij('Aantal jaren fictieve onttrekking (cumulatief)', (j) => cel(j.k, '', 'getal'));
    rij('Aansprakelijk vermogen na correcties', (j) => cel(j.EVcor));
    rij('Balanstotaal na correcties', (j) => cel(j.TVcor));
    rij(`Maximale overwinst solvabiliteit (≥ ${pct0(d.opties.solvNorm)})`, (j) => cel(j.maxSolv, `(${g(j.EVcor)} - ${pct0(d.opties.solvNorm)} × ${g(j.TVcor)}) / ${pct0(1 - d.opties.solvNorm)}${j.k > 1 ? ` / ${j.k}` : ''} =`), { stijl: 'resultaat' });
    rij('Vlottende activa na correcties', (j) => cel(j.VAcor));
    rij('Kort vreemd vermogen na correcties', (j) => cel(j.KVVcor));
    if (d.opties.liqMethode === 'cr') {
      rij(`Maximale overwinst liquiditeit (current ratio ≥ ${r(d.opties.crNorm)})`, (j) => cel(j.maxCr, `${g(j.VAcor)} - ${r(d.opties.crNorm)} × ${g(j.KVVcor)}${j.k > 1 ? ` / ${j.k}` : ''} =`), { stijl: 'resultaat' });
    } else {
      rij('Werkkapitaal na correcties', (j) => cel(j.WK));
      s.rij('Gemiddeld werkkapitaal, maximaal laatste jaar', { [d.jaren.includes(T3) ? T3 : d.jaren[0]]: cel(d.maxLiq, `gemiddeld ${g(d.gemWk)}; laatste jaar ${g(d.wkLaatst)}${d.wkC !== null ? `; controlejaar ${g(d.wkC)}` : ''}; laagste =`) }, { stijl: 'resultaat' });
    }
  } else {
    s.tekst('Dubbele balanstoets', 'Geen balans in het (de) te toetsen jaar (jaren): de overwinst kan niet worden getoetst en wordt niet meegenomen.');
  }

  const v = res.trace.sectie('Vaststelling overwinst', { groep: 'inkomen', kolommen: ['uitkomst'], kolomLabels: { uitkomst: 'Uitkomst' } });
  v.rij('Gemiddelde overwinst vóór dubbele balanstoets', { uitkomst: cel(x.basis) });
  v.rij('Maximale overwinst na dubbele balanstoets (laagste van solvabiliteit en liquiditeit)', { uitkomst: cel(d.max, d.jaren.length ? laagsteF([d.maxSolv, d.maxLiq]) : '') });
  if (x.owC !== null) v.rij('Maximaal de overwinst in het controlejaar (geëxtrapoleerd)', { uitkomst: cel(x.owC) });
  if (x.vrij !== null) v.rij(`Balanstest: vrij uitkeerbare reserves (${x.vrijLabel})`, { uitkomst: cel(x.vrij) });
  v.rij('Overwinst na dubbele balanstoets', { uitkomst: cel(x.naDbt, laagsteF([x.basis, d.max, ...(x.owC !== null ? [x.owC] : []), ...(x.vrij !== null ? [x.vrij] : [])])) }, { stijl: 'som' });
  v.rij(`× belang${x.afslag ? ` × ${pct0(1 - x.afslag)} (afslag ${pct0(x.afslag)})` : ''}`, { uitkomst: cel(x.bruto, `${g(x.naDbt)} × ${pct0(x.aandeel)}${x.afslag ? ` × ${pct0(1 - x.afslag)}` : ''} =`) }, { stijl: 'resultaat' });
  x.voorwaarden.forEach((c) => v.rij(`Voorwaarde: ${c.label}`, { uitkomst: cel(c.tekst, '', 'tekst', c.status) }));
  v.rij('Mee te nemen overwinst', { uitkomst: cel(x.bedrag, x.toegestaan ? '' : 'voorwaarden niet akkoord') }, { stijl: 'totaal' });
  if (x.benodigd > 0) v.rij('Benodigde balansversterking om de volledige overwinst mee te nemen', { uitkomst: cel(x.benodigd) });
}

// ---------------------------------------------------------------------------
// Box 2 (alleen VPB)
// ---------------------------------------------------------------------------
export function box2NHG(res, ond, ctx) {
  const { T, kader, instellingen = {} } = ctx;
  const J = res.jaren;
  const T3 = T[2];
  const route = instellingen.box2Route || 'route1';
  const out = { route, route1: 0, route2: 0, totaal: 0, toegestaan: true, redenen: [], trace: null };
  const tr = res.trace.sectie('Box 2 inkomen (dividend en overwinst)', {
    groep: 'inkomen', kolommen: [...T], richtlijn: 'NHG: route 1 uitgekeerd dividend, route 2 nog niet uitgekeerde winstreserve (afslag 25%), of een gemotiveerde combinatie.',
  });

  if (res.maandenOndernemer < kader.box2.minMaanden) {
    out.toegestaan = false;
    out.redenen.push('Korter dan 36 maanden actief: geen overwinst of box 2 inkomen.');
  }
  const div = T.map((y) => num(J[y]?.ibOnd?.dividend));
  const rvb = T.map((y) => J[y]?.winst.RVBcor ?? 0);
  tr.rij('Ontvangen dividend (IB-aangifte, bruto)', Object.fromEntries(T.map((y, i) => [y, cel(div[i])])));
  tr.rij('Winst vóór belasting na correcties (incl. deelnemingen)', Object.fromEntries(T.map((y, i) => [y, cel(rvb[i])])));

  const gemDiv = rond(gemiddelde(div));
  const r1Ruw = Math.min(gemDiv, div[2]);
  const gemRvb = rond(gemiddelde(rvb));
  const capWinst = Math.max(0, Math.min(gemRvb, rvb[2])) * res.aandeel;
  const route1 = Math.max(0, Math.min(r1Ruw, rond(capWinst)));
  tr.rij('Route 1: gemiddeld dividend, maximaal laatste jaar', { [T3]: cel(r1Ruw, `${laagsteF([gemDiv, div[2]])}`) });
  tr.rij('Maximum: gemiddelde winst vóór belasting, max. laatste jaar × belang', { [T3]: cel(rond(capWinst), `${laagsteF([gemRvb, rvb[2]])} × ${p(res.aandeel)}`) });
  tr.rij('Route 1: uitgekeerd dividend', { [T3]: cel(route1, laagsteF([r1Ruw, rond(capWinst)])) }, { stijl: 'resultaat' });

  // Route 2: overwinst na dubbele balanstoets (zie de secties "Overwinst" en "Controle dubbele balanstoets")
  const ow = berekenOverwinst(res, ond, ctx);
  out.overwinst = ow;
  let route2 = ow.bruto;
  ow.voorwaarden.filter((c) => c.status !== 'akkoord' && !/36 maanden/.test(c.label)).forEach((c) => out.redenen.push(`Route 2: ${c.label.toLowerCase()} (${c.tekst})`));
  if (!ow.toegestaan) route2 = 0;
  tr.rij('Route 2: overwinst na dubbele balanstoets × belang × 75%', { [T3]: cel(route2, `${g(ow.naDbt)} × ${p(res.aandeel)} × 75% =`) }, { stijl: 'resultaat' });
  if (ow.benodigd > 0) out.benodigdVoorOverwinst = ow.benodigd;

  out.route1 = route1;
  out.route2 = route2;
  out.dbt = { liquiditeit: Math.max(0, ow.dbt.maxLiq ?? 0), solvabiliteit: Math.max(0, ow.dbt.maxSolv ?? 0), overwinst: ow.basis };
  out.capCombinatie = rond(capWinst * (1 - kader.box2.afslag));
  if (!out.toegestaan || route === 'geen') out.totaal = 0;
  else if (route === 'route1') out.totaal = route1;
  else if (route === 'route2') out.totaal = route2;
  else {
    out.totaal = Math.min(route1 + route2, out.capCombinatie);
    tr.rij('Uitzonderingsroute: dividend + overwinst, max. 75% van gemiddelde winst', { [T3]: cel(out.totaal, `${laagsteF([route1 + route2, out.capCombinatie])}`) });
  }
  tr.rij(`Box 2 inkomen (${route === 'route1' ? 'route 1' : route === 'route2' ? 'route 2' : route === 'geen' ? 'niet meegenomen' : 'combinatie'})`, { [T3]: cel(out.totaal) }, { stijl: 'totaal' });
  out.redenen.forEach((x) => tr.tekst('Voorwaarde', x));
  return out;
}

/** Keuzes voor dividend en overwinst van een hoofdbedrijf (ABN AMRO), met terugval op de oude dossierinstelling. */
export function overwinstKeuzes(ond = {}, instellingen = {}) {
  const oud = instellingen.abnDividend || {};
  const ow = ond.overwinst || {};
  return {
    meenemen: typeof ow.meenemen === 'boolean' ? ow.meenemen : !!oud.nietUitgekeerd,
    kasstroomBevestigd: typeof ow.kasstroomBevestigd === 'boolean' ? ow.kasstroomBevestigd : !!oud.kasstroomBevestigd,
    solvNorm: ow.solvNorm, liqMethode: ow.liqMethode, jaren: ow.jaren, cumulatief: ow.cumulatief, controlejaar: ow.controlejaar,
  };
}

export function box2ABN(res, ond, ctx) {
  const { T, kader, instellingen = {} } = ctx;
  const J = res.jaren;
  const T3 = T[2];
  const keuze = instellingen.abnDividend || {};
  const ok = overwinstKeuzes(ond, instellingen);
  const out = { uitgekeerd: 0, nietUitgekeerd: 0, totaal: 0, toegestaan: true, redenen: [], overwinstMeenemen: ok.meenemen };
  const tr = res.trace.sectie('Dividend DGA (Woonbeleid 3.63)', { groep: 'inkomen', kolommen: [...T] });
  if (res.maandenTotT3 < kader.box2.minMaanden) {
    out.toegestaan = false;
    out.redenen.push('Korter dan 3 boekjaren ondernemer: dividend wordt niet meegenomen.');
  }
  const div = T.map((y) => num(J[y]?.ibOnd?.dividend));
  const nw = T.map((y) => J[y]?.winst.NWcor ?? 0);
  tr.rij('Bruto dividend (IB-aangifte)', Object.fromEntries(T.map((y, i) => [y, cel(div[i])])));
  tr.rij('Nettowinst na correcties', Object.fromEntries(T.map((y, i) => [y, cel(nw[i])])));
  const gemDiv = rond(gemiddelde(div));
  const gemNw = rond(gemiddelde(nw));
  const cap = Math.max(0, Math.min(gemNw, nw[2])) * res.aandeel;
  const uitgekeerd = keuze.uitgekeerd === false ? 0 : Math.max(0, Math.min(gemDiv, div[2], rond(cap)));
  tr.rij('Uitgekeerd dividend: laagste van gemiddelde en laatste jaar, max. gemiddelde nettowinst × belang',
    { [T3]: cel(uitgekeerd, `${laagsteF([gemDiv, div[2], rond(cap)])}`) }, { stijl: 'resultaat' });

  // Overwinst (niet-uitgekeerd dividend) met dubbele balanstoets: altijd berekend, alleen meegenomen als gekozen.
  const ow = berekenOverwinst(res, ond, ctx, ok);
  out.overwinst = ow;
  const nietUitgekeerd = ok.meenemen ? ow.bedrag : 0;
  if (ok.meenemen) {
    ow.voorwaarden.filter((c) => c.status !== 'akkoord').forEach((c) => out.redenen.push(`Niet-uitgekeerd dividend: ${c.label.toLowerCase()} (${c.tekst})`));
    tr.rij('Niet-uitgekeerd dividend (overwinst na dubbele balanstoets × belang)', { [T3]: cel(nietUitgekeerd, `${g(ow.naDbt)} × ${p(res.aandeel)} =`) }, { stijl: 'resultaat' });
  }
  out.uitgekeerd = uitgekeerd;
  out.nietUitgekeerd = nietUitgekeerd;
  out.gemiddeldDividend = gemDiv;
  out.plafond = rond(cap);
  out.totaal = out.toegestaan ? Math.min(uitgekeerd + nietUitgekeerd, rond(cap)) : 0;
  out.geplafonneerd = out.toegestaan && uitgekeerd + nietUitgekeerd > rond(cap);
  tr.rij('Inkomen uit dividend', { [T3]: cel(out.totaal, out.geplafonneerd ? `${laagsteF([uitgekeerd + nietUitgekeerd, rond(cap)])}` : '') }, { stijl: 'totaal' });
  out.redenen.forEach((x) => tr.tekst('Voorwaarde', x));
  return out;
}

// ---------------------------------------------------------------------------
// Trace (uitgebreide rapportage) per onderneming
// ---------------------------------------------------------------------------
function bouwTraceOnderneming(res, ctx, kolLabels) {
  const { T, C, kader } = ctx;
  const jaren = C ? [...T, C] : [...T];
  const J = res.jaren;
  const t = res.trace;
  const k = { kolommen: jaren, kolomLabels: kolLabels };
  const rij = (s, label, fn, extra) => s.rij(label, Object.fromEntries(jaren.map((y) => [y, fn(J[y], y)])), extra);
  const detailVW = jaren.some((y) => J[y].heeftVW && !J[y].aggVW);

  // Box 1 per jaar
  const s1 = t.sectie('Berekening jaarlijks box 1 inkomen', { ...k, groep: 'inkomen',
    richtlijn: res.soort === 'VPB' ? 'Inkomen = loon DGA volgens IB-aangifte, gecorrigeerd voor bijtelling auto.'
      : 'Inkomen = saldo fiscale winst volgens IB-aangifte (of nettowinst × aandeel als er nog geen aangifte is), na correcties.' });
  rij(s1, res.soort === 'VPB' ? 'Loon DGA (IB-aangifte / salarisadministratie)' : 'Basis (saldo fiscale winst of nettowinst)',
    (j) => cel(j.inkomen.basis, j.inkomen.bron === 'NW' ? `NW × ${p(j.aandeel)}` : j.inkomen.bron === 'SALARIS' ? 'salaris uit V&W' : ''));
  const labelsPos = new Set();
  const labelsNeg = new Set();
  jaren.forEach((y) => { J[y].inkomen.pos.forEach((x) => labelsPos.add(x.label)); J[y].inkomen.neg.forEach((x) => labelsNeg.add(x.label)); });
  labelsPos.forEach((l) => rij(s1, `+ ${l}`, (j) => cel(somL(j.inkomen.pos.filter((x) => x.label === l)))));
  labelsNeg.forEach((l) => rij(s1, `- ${l}`, (j) => cel(somL(j.inkomen.neg.filter((x) => x.label === l)))));
  rij(s1, 'Box 1 inkomen na correcties', (j) => cel(j.inkomen.totaal, somF(j.inkomen.basis, [somL(j.inkomen.pos)], [somL(j.inkomen.neg)])), { stijl: 'som' });
  if (C) {
    s1.rij('Geëxtrapoleerd naar volledig jaar', { [C]: cel(rond(J[C].inkomen.extr), `${g(J[C].inkomen.totaal)} × ${String(J[C].factor).replace('.', ',')} =`) }, { stijl: 'resultaat' });
  }

  // Winstgevendheid
  const s2 = t.sectie('Berekening winstgevendheid', { ...k, groep: 'kengetallen',
    richtlijn: kader.id === 'NHG' ? 'Nettowinst na correcties ≥ 0 in het laatste toetsjaar en in het controlejaar.' : 'Positief resultaat in het laatste boekjaar en in een van de twee voorgaande boekjaren.' });
  rij(s2, 'Totale omzet', (j) => cel(j.vw.OMZET + num(j.vwRuw.overigeOpbrengsten)));
  if (detailVW) {
    rij(s2, 'Inkoopwaarde en uitbesteed werk', (j) => cel(num(j.vwRuw.inkoopwaarde) + num(j.vwRuw.uitbesteedWerk)));
    rij(s2, 'Bruto bedrijfsresultaat', (j) => cel(j.vw.BRUTO));
    rij(s2, 'Totaal bedrijfskosten', (j) => cel(j.vw.KOSTEN));
    rij(s2, 'Netto bedrijfsresultaat', (j) => cel(j.vw.BEDRIJFSRESULTAAT, `${g(j.vw.BRUTO)} - ${g(j.vw.KOSTEN)} =`));
    rij(s2, 'Financiële baten en lasten', (j) => cel(j.vw.FIN));
    rij(s2, 'Bijzondere baten en lasten', (j) => cel(j.vw.BUITENGEWOON));
    rij(s2, 'Resultaat vóór belastingen', (j) => cel(j.vw.RVB, j.aggVW ? 'totaalpost' : somF(j.vw.BEDRIJFSRESULTAAT, [j.vw.FIN, j.vw.BUITENGEWOON])), { stijl: 'som' });
    if (res.soort === 'VPB') {
      rij(s2, 'Resultaat deelnemingen', (j) => cel(num(j.vwRuw.resultaatDeelnemingen)));
      rij(s2, 'Vennootschapsbelasting', (j) => cel(num(j.vwRuw.vpb)));
    }
  }
  rij(s2, kader.id === 'NHG' && !detailVW ? 'Winst (totaalpost)' : 'Nettowinst', (j) => cel(j.winst.NW, j.aggVW ? 'totaalpost' : ''), { stijl: 'som' });
  const wPos = new Set();
  const wNeg = new Set();
  jaren.forEach((y) => { J[y].winst.pos.forEach((x) => wPos.add(x.label)); J[y].winst.neg.forEach((x) => wNeg.add(x.label)); });
  wPos.forEach((l) => rij(s2, `+ ${l}`, (j) => cel(somL(j.winst.pos.filter((x) => x.label === l)))));
  wNeg.forEach((l) => rij(s2, `- ${l}`, (j) => cel(somL(j.winst.neg.filter((x) => x.label === l)))));
  rij(s2, 'Nettowinst na correcties', (j) => cel(j.winst.NWcor, somF(j.winst.NW, [somL(j.winst.pos)], [somL(j.winst.neg)])), { stijl: 'resultaat' });
  if (C) s2.rij('Nettowinst na correcties, geëxtrapoleerd', { [C]: cel(rond(J[C].winst.NWcorExtr), `${g(J[C].winst.NWcor)} × ${String(J[C].factor).replace('.', ',')} =`) });

  // Liquiditeit
  const s3 = t.sectie('Berekening liquiditeit (current ratio) en werkkapitaal', { ...k, groep: 'kengetallen',
    formule: 'Current ratio = vlottende activa na correcties / kort vreemd vermogen na correcties; werkkapitaal (liquiditeitsruimte) = vlottende activa na correcties - kort vreemd vermogen na correcties.' });
  rij(s3, 'Totaal vlottende activa', (j) => cel(j.bal.VA, j.aggBalans ? 'totaalpost' : ''));
  correctieRijen(s3, jaren, J, 'vaNeg', '-');
  correctieRijen(s3, jaren, J, 'vaPos', '+');
  rij(s3, 'Vlottende activa na correcties', (j) => cel(j.VAcor), { stijl: 'som' });
  rij(s3, 'Totaal kort vreemd vermogen', (j) => cel(j.bal.KVV, j.aggBalans ? 'totaalpost' : ''));
  correctieRijen(s3, jaren, J, 'kvvNeg', '+');
  correctieRijen(s3, jaren, J, 'kvvPos', '-');
  rij(s3, 'Kort vreemd vermogen na correcties', (j) => cel(j.KVVcor), { stijl: 'som' });
  rij(s3, 'Current ratio', (j) => cel(j.CR, j.KVVcor > 0 ? `${g(j.VAcor)} / ${g(j.KVVcor)} =` : 'geen KVV', 'ratio'), { stijl: 'resultaat' });
  rij(s3, 'Quick ratio (ter informatie)', (j) => cel(j.QR, '', 'ratio'));
  rij(s3, 'Werkkapitaal / liquiditeitsruimte', (j) => cel(j.WK, `${g(j.VAcor)} - ${g(j.KVVcor)} =`), { stijl: 'resultaat' });

  // Solvabiliteit
  const n = kader.id === 'NHG' ? kader.bandbreedte.norm : kader.solvabiliteitMin;
  const s4 = t.sectie('Berekening solvabiliteit', { ...k, groep: 'kengetallen',
    formule: `Solvabiliteit = aansprakelijk vermogen (eigen vermogen na correcties) / balanstotaal na correcties × 100%. Solvabiliteitsruimte = (aansprakelijk vermogen - ${p(n)} × balanstotaal na correcties) / ${p(1 - n)}.`,
    richtlijn: kader.id === 'NHG' ? 'Minimaal 25% volgens het bandbreedtemodel (30% / 25% / 20%).' : 'Richtlijn minimaal 20% in het laatste jaar of gemiddeld over de afgelopen 3 jaar (gemiddelde solvabiliteitsruimte ≥ 0).' });
  rij(s4, 'Eigen vermogen', (j) => cel(j.bal.EV, j.aggBalans ? 'totaalpost' : ''));
  correctieRijen(s4, jaren, J, 'evNeg', '-');
  correctieRijen(s4, jaren, J, 'evPos', '+');
  rij(s4, 'Aansprakelijk vermogen (eigen vermogen na correcties)', (j) => cel(j.EVcor), { stijl: 'som' });
  rij(s4, 'Totaal vermogen (balanstotaal)', (j) => cel(j.bal.TA, j.aggBalans ? 'totaalpost' : ''));
  correctieRijen(s4, jaren, J, 'tvNeg', '-');
  correctieRijen(s4, jaren, J, 'tvPos', '+');
  rij(s4, 'Balanstotaal na correcties', (j) => cel(j.TVcor), { stijl: 'som' });
  rij(s4, 'Solvabiliteit', (j) => cel(j.SV, j.TVcor > 0 ? `${g(j.EVcor)} / ${g(j.TVcor)} =` : 'geen balans', 'pct'), { stijl: 'resultaat' });
  rij(s4, 'Solvabiliteitsruimte', (j) => cel(j.solvRuimte === null ? null : rond(j.solvRuimte), j.solvRuimte === null ? '' : `(${g(j.EVcor)} - ${p(n)} × ${g(j.TVcor)}) / ${p(1 - n)} =`));

  // Trends en omlooptijden
  const s5 = t.sectie('Trends en omlooptijden (ter informatie)', { ...k, groep: 'kengetallen' });
  s5.rij('Trend winstgevendheid', Object.fromEntries(jaren.map((y, i) => [y, cel(res.trendPct.winst[i], '', 'pct')])), { trend: res.trendLabels.winst });
  s5.rij('Trend liquiditeit', Object.fromEntries(jaren.map((y, i) => [y, cel(res.trendPct.cr[i], '', 'pct')])), { trend: res.trendLabels.cr });
  s5.rij('Trend werkkapitaal', Object.fromEntries(jaren.map((y, i) => [y, cel(res.trendPct.wk[i], '', 'pct')])), { trend: res.trendLabels.wk });
  s5.rij('Trend solvabiliteit', Object.fromEntries(jaren.map((y, i) => [y, cel(res.trendPct.sv[i], '', 'pct')])), { trend: res.trendLabels.sv });
  rij(s5, 'Omlooptijd debiteuren (dagen)', (j) => cel(j.omlDeb, 'debiteuren / omzet × 365', 'getal'));
  rij(s5, 'Omlooptijd crediteuren (dagen)', (j) => cel(j.omlCred, 'crediteuren / kostprijs × 365', 'getal'));
}

function correctieRijen(s, jaren, J, lijst, teken) {
  const labels = new Set();
  jaren.forEach((y) => J[y].corr[lijst].forEach((x) => labels.add(x.label)));
  labels.forEach((l) => {
    s.rij(`${teken} ${l}`, Object.fromEntries(jaren.map((y) => [y, cel(somL(J[y].corr[lijst].filter((x) => x.label === l)))])));
  });
}
