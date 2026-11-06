// Totaalberekeningen voor de kaders die het inkomen op totaalniveau bepalen naast NHG:
// ASN Bank (Risk Policy v1.5), Knab (concept toetskader 2024.013) en Optimaal (ZIB-ontwerp).
// Elke functie levert dezelfde vorm als de NHG-berekening (perJaar, gemiddelde, basis, box1, box2,
// berekend, toetsinkomen, stappen, meldingen, perOnderneming, persoonlijk) plus kaderspecifieke velden,
// en legt elke stap vast in de trace.
import * as P from './periods.js';
import { starterFactor } from './kaders.js';
import { cel, g, p, lijstF, laagsteF } from './trace.js';
import { num, rond, gemiddelde, isIngevuld } from '../util.js';

const pctT = (x) => `${Math.round(x * 1000) / 10}%`.replace('.', ',');

export function dertigProcentToets(ld = {}, kader) {
  if (!kader.dertigProcentRegel) return null;
  const pct = num(ld.actueelPct);
  const loon = num(ld.loonJaar);
  if (pct < kader.dertigProcentRegel.vanafPct || loon <= 0) return null;
  const y = pct / 100;
  const fulltime = loon / y;
  const A = rond(fulltime * kader.dertigProcentRegel.pct);
  const B = rond((1 - y) * fulltime);
  return { pct, loon, fulltime: rond(fulltime), A, B, max: A + B,
    f: `A: (100% / ${pct}%) × ${g(loon)} × 30% = ${g(A)}; B: ((100% - ${pct}%) / 100%) × ${g(rond(fulltime))} = ${g(B)}` };
}

/** Persoonlijke box 1-inkomsten per jaar (loon vóór de start, loon naast de onderneming, uitkeringen, ROW). */
export function persoonlijkInkomen(dossier, jaren, kader, { voorStart = true } = {}) {
  const ld = dossier.loondienst || {};
  const pers = {};
  jaren.forEach((y) => {
    const ib = dossier.ib?.[y] || dossier.ib?.[String(y)] || {};
    const vs = ld.voorStartMeenemen === false || !voorStart ? 0 : num(ib.voorStart);
    const naast = ld.meenemen && kader.loondienstMeenemen !== false ? num(ib.naast) : 0;
    const uitk = dossier.uitkeringLooptNog ? 0 : num(ib.uitkeringen);
    const row = ld.rowMeenemen === false ? 0 : num(ib.row);
    pers[y] = { voorStart: vs, naast, uitk, row, totaal: vs + naast + uitk + row,
      ingevuld: [ib.voorStart, ib.naast, ib.uitkeringen, ib.row].some(isIngevuld),
      voorStartIngevuld: num(ib.voorStart) !== 0, naastIngevuld: num(ib.naast) !== 0 };
  });
  return pers;
}

/** Cijfers van het controlejaar: gerealiseerd en geëxtrapoleerd, met de extrapolatiefactor en het aantal maanden. */
export function controlejaarCijfers(mee, C, pers, T3, ondJaar) {
  const met = mee.find((a) => a.jaren[C]?.heeftVW || isIngevuld(a.jaren[C]?.ibOnd?.loon));
  const factor = met ? met.jaren[C].factor : 1;
  const persReal = pers[C].ingevuld ? pers[C].totaal : pers[T3].totaal / factor;
  const persExtr = pers[C].ingevuld ? pers[C].totaal * factor : pers[T3].totaal;
  const maanden = met ? P.maandenInclusief(met.jaren[C].van, met.jaren[C].tot) : 0;
  return { factor, cReal: rond(ondJaar(C) + persReal), cExtr: rond(ondJaar(C, 'extr') + persExtr), maanden, heeft: !!met,
    van: met?.jaren[C].van, tot: met?.jaren[C].tot };
}

/** 1-2-3-weging, maximaal een percentage boven het gewone gemiddelde en maximaal het laatste jaar. */
export function gewogen123(w, maxBoven111) {
  const W = (w[0] + 2 * w[1] + 3 * w[2]) / 6;
  const A = (w[0] + w[1] + w[2]) / 3;
  const capA = maxBoven111 === null || maxBoven111 === undefined ? null : A * (1 + maxBoven111);
  const uit = Math.min(W, capA ?? Infinity, w[2]);
  return { W: rond(W), A: rond(A), capA: capA === null ? null : rond(capA), uit: rond(uit),
    fW: `(${g(w[0])} + 2 × ${g(w[1])} + 3 × ${g(w[2])}) / 6 =` };
}

/** Dalende trend (Knab B.1.2.1): > 40% van oudste naar laatste én > 20% van middelste naar laatste jaar. */
export function trendSignaal(w, kader) {
  const t = kader.trendRegel;
  if (!t) return null;
  const [a, b, c] = w;
  if (!(a > t.minInkomen)) return null;
  const dO = a > 0 ? (a - c) / a : 0;
  const dM = b > 0 ? (b - c) / b : 0;
  return dO > t.dalingOudst && dM > t.dalingMiddel ? { dO, dM } : null;
}

/** Jongste meegenomen (hoofd)onderneming: bepaalt of het dossier een starter is. */
export function starterInfo(mee) {
  const hoofden = mee.filter((a) => !a.isDeelneming);
  const lijst = hoofden.length ? hoofden : mee;
  if (!lijst.length) return { maanden: 999, start: '', startY: null, naam: '' };
  const j = lijst.reduce((x, a) => (a.maandenOndernemer < x.maandenOndernemer ? a : x), lijst[0]);
  return { maanden: j.maandenOndernemer, start: j.start, startY: j.start ? P.parseISO(j.start)?.y : null, naam: j.naam };
}

/** Prognose (RA/AA, NBA 3400) uit de onderneming of de V&W van het lopende jaar. */
function prognoseVan(mee, dossier, C, T3) {
  let som = 0;
  let iets = false;
  mee.filter((a) => !a.isDeelneming).forEach((a) => {
    const ond = (dossier.ondernemingen || []).find((o) => o.id === a.id) || {};
    if (isIngevuld(ond.prognoseBedrag)) { som += num(ond.prognoseBedrag); iets = true; return; }
    const v = (C ? a.jaren[C]?.vwRuw?.prognose : null) ?? ond.jaren?.[T3 + 1]?.vw?.prognose;
    if (isIngevuld(v)) { som += num(v) * (a.aandeel || 1); iets = true; }
  });
  return iets ? rond(som) : null;
}

/** Beletperiode of incident: één toetsjaar vervangen (Knab D.1 / Optimaal: laagste omliggende jaar; ASN §3.8: tussentijdse cijfers). */
function beletVervangen(TOT, T, C, cj, inst, kader, starter) {
  const b = inst.belet || {};
  if (!b.actief || (!kader.beletRegel && !kader.incidentRegel)) return null;
  const y = num(b.jaar);
  const uit = { jaar: y, oorzaak: b.oorzaak || '', motivatie: b.motivatie || '', fout: '' };
  if (starter && kader.beletRegel) { uit.fout = 'Een beletperiode kan alleen bij een onderneming die 36 maanden of langer bestaat.'; return uit; }
  if (!T.includes(y)) { uit.fout = `Het jaar ${y || '(leeg)'} is geen toetsjaar.`; return uit; }
  const oud = TOT[y];
  let nieuw;
  if (kader.incidentRegel) {
    if (!C || !cj?.heeft) { uit.fout = 'Voor een incidenteel jaar zijn tussentijdse cijfers van het lopende jaar nodig.'; return uit; }
    nieuw = cj.cExtr;
    uit.bron = `tussentijdse cijfers ${C} (geëxtrapoleerd)`;
  } else {
    const i = T.indexOf(y);
    const buren = [];
    if (i > 0) buren.push([T[i - 1], TOT[T[i - 1]]]);
    if (i < T.length - 1) buren.push([T[i + 1], TOT[T[i + 1]]]);
    else if (C && cj?.heeft) buren.push([`${C} (geëxtrapoleerd)`, cj.cExtr]);
    if (!buren.length) { uit.fout = 'Geen omliggend jaar beschikbaar.'; return uit; }
    const laagste = buren.reduce((x, z) => (z[1] < x[1] ? z : x));
    nieuw = laagste[1];
    uit.bron = `laagste omliggende jaar (${laagste[0]})`;
    uit.maxNa = C && cj?.heeft ? cj.cExtr : (i < T.length - 1 ? TOT[T[i + 1]] : null);
  }
  uit.oud = oud;
  uit.nieuw = Math.max(oud, rond(nieuw));
  TOT[y] = uit.nieuw;
  return uit;
}

function rijPerOnderneming(s, mee, jaren, C, veld = 'totaal') {
  mee.forEach((a) => {
    s.rij(`Box 1 inkomen ${a.naam}`, Object.fromEntries(jaren.map((y) => [y, cel(rond(a.jaren[y]?.inkomen[veld] ?? 0))])));
  });
}

function persRijen(s, pers, jaren) {
  const persRij = (label, key) => {
    if (jaren.some((y) => pers[y][key])) s.rij(label, Object.fromEntries(jaren.map((y) => [y, cel(pers[y][key])])));
  };
  persRij('Looninkomsten vóór starten onderneming', 'voorStart');
  persRij('Looninkomen naast ondernemerschap (meegenomen)', 'naast');
  persRij('Inkomensvervangende uitkeringen (niet lopend)', 'uitk');
  persRij('Resultaat uit overige werkzaamheden', 'row');
}

function perOndernemingUit(mee, T, C) {
  return mee.map((a) => {
    const w = T.map((y) => rond(a.jaren[y]?.inkomen.totaal ?? 0));
    const gemO = rond(gemiddelde(w));
    return { id: a.id, naam: a.naam, jaren: Object.fromEntries(T.map((y, i) => [y, w[i]])),
      controleReal: C ? rond(a.jaren[C]?.inkomen.totaal ?? 0) : null,
      controleExtr: C ? rond(a.jaren[C]?.inkomen.extr ?? 0) : null,
      gemiddelde: Math.min(gemO, w[2]), box2: num(a.box2?.totaal) };
  });
}

function dertigProcent(ld, kader, pers, T, bedrag, s, stappen) {
  const toets30 = dertigProcentToets(ld, kader);
  if (!toets30) return { bedrag, toets30 };
  const persGem = rond(gemiddelde(T.map((y) => pers[y].totaal)));
  const max = persGem + toets30.max;
  s.rij('Maximaal ondernemersinkomen bij loondienst ≥ 80% (A + B)', { [T[2]]: cel(toets30.max, toets30.f) });
  if (bedrag > max) {
    stappen.push(`Het ondernemersinkomen is begrensd op ${g(toets30.max)} (loondienstverband ≥ 80%).`);
    s.rij('Inkomen na begrenzing loondienst', { [T[2]]: cel(max, `${g(persGem)} + ${g(toets30.max)} =`) }, { stijl: 'resultaat' });
    return { bedrag: max, toets30 };
  }
  return { bedrag, toets30 };
}

// ---------------------------------------------------------------------------
// ASN Bank (de Volksbank, Risk Policy v1.5)
// ---------------------------------------------------------------------------
export function totaalASN(dossier, analyses, ctx, trace) {
  const { T, C, vervanging, kader } = ctx;
  const T3 = T[2];
  const inst = dossier.instellingen || {};
  const ld = dossier.loondienst || {};
  const mee = analyses.filter((a) => a.meenemen);
  const jaren = C ? [...T, C] : [...T];
  const relevant = inst.relevantDienstverband === true;
  const pers = persoonlijkInkomen(dossier, jaren, kader, { voorStart: relevant });
  const ondJaar = (y, veld = 'totaal') => mee.reduce((s, a) => s + num(a.jaren[y]?.inkomen[veld]), 0);
  const TOT = {};
  T.forEach((y) => { TOT[y] = rond(ondJaar(y) + pers[y].totaal); });
  const cj = C ? controlejaarCijfers(mee, C, pers, T3, ondJaar) : null;
  const stappen = [];
  const meldingen = [];
  const st = starterInfo(mee);
  const trackrecord = relevant && inst.trackrecordZelfdeOnderneming === true;
  const starter = st.maanden < 36 && !trackrecord;

  const s = trace.sectie('Berekening inkomen ASN Bank (Risk Policy v1.5)', {
    groep: 'inkomen', kolommen: jaren,
    kolomLabels: Object.fromEntries(jaren.map((y) => [y, y === C ? `${y} (lopend jaar)` : String(y)])),
    richtlijn: '§3.1/3.2: gemiddelde van 3 boekjaren (IB: saldo fiscale winst; DGA: loon, een verlies van de BV telt mee); maximaal het laatste jaar, voor een DGA plus het resultaat na Vpb van dat jaar.',
  });
  rijPerOnderneming(s, mee, jaren, C);
  persRijen(s, pers, jaren);
  const totRij = Object.fromEntries(T.map((y) => [y, cel(TOT[y])]));
  if (cj) totRij[C] = cel(cj.cReal, 'gerealiseerd');
  s.rij('Totaal box 1 inkomen per jaar', totRij, { stijl: 'som' });

  const incident = beletVervangen(TOT, T, C, cj, inst, kader, starter);
  if (incident && !incident.fout) {
    s.rij(`Incidenteel jaar ${incident.jaar} vervangen (§3.8)`, { [incident.jaar]: cel(incident.nieuw, `${g(incident.oud)} → ${incident.bron}`) }, { stijl: 'resultaat' });
    stappen.push(`Incidenteel jaar ${incident.jaar} (${incident.oorzaak || 'oorzaak niet vastgelegd'}) vervangen door ${incident.bron}: ${g(incident.oud)} → ${g(incident.nieuw)}.`);
    meldingen.push({ niveau: 'attentie', tekst: `ASN §3.8: een incident moet duidelijk worden omschreven en worden voorgelegd aan een senior specialist (tweede fiat).${incident.motivatie ? '' : ' Leg de motivatie vast.'}` });
  } else if (incident?.fout) {
    meldingen.push({ niveau: 'attentie', tekst: `Incidenteel jaar niet toegepast: ${incident.fout}` });
  }

  const dga = mee.filter((a) => a.soort === 'VPB' && !a.isDeelneming);
  const resLaatste = (a) => Math.max(0, rond((a.jaren[T3]?.winst.NWcor ?? 0) * (a.jaren[T3]?.aandeel ?? a.aandeel)));
  const extraLaatste = dga.reduce((x, a) => x + resLaatste(a), 0);
  const capBox1 = TOT[T3] + extraLaatste;
  let box1;
  let gem = rond(gemiddelde(T.map((y) => TOT[y])));
  let starterUit = null;

  if (st.maanden < 12) {
    box1 = 0;
    stappen.push('Korter dan 12 maanden ondernemer: geen inkomen uit onderneming.');
    s.rij('Korter dan 12 maanden ondernemer', { [T3]: cel(0) }, { stijl: 'resultaat' });
  } else if (starter) {
    // §3.7: gemiddelde over de werkelijke maanden; 75% of 90%; maximaal het laatste volledige jaar; prognose kan verlagen.
    const startY = st.startY || T[0];
    const actief = T.filter((y) => y >= startY);
    const volle = actief.filter((y) => y > startY || (st.start && st.start.slice(5) === '01-01'));
    const zonderStartjaar = volle.length >= 2 && actief.includes(startY) && !volle.includes(startY);
    const jarenIn = zonderStartjaar ? actief.filter((y) => y !== startY) : actief;
    const mnd = (y) => (y === startY && st.start ? Math.min(12, P.maandenInclusief(st.start, `${y}-12-31`)) : 12);
    let somInk = jarenIn.reduce((x, y) => x + TOT[y], 0);
    let maanden = jarenIn.reduce((x, y) => x + mnd(y), 0);
    const defMaanden = maanden;
    if (cj?.heeft && cj.maanden > 0) { somInk += cj.cReal; maanden += cj.maanden; }
    const jaarbasis = maanden > 0 ? rond((somInk / maanden) * 12) : 0;
    const f = defMaanden >= 24 ? 0.90 : 0.75;
    const factor = kader.starterFactoren?.[defMaanden >= 24 ? 1 : 0]?.factor ?? f;
    const naFactor = rond(jaarbasis * factor);
    const laatsteVol = volle.includes(T3) ? TOT[T3] : null;
    const prognose = prognoseVan(mee, dossier, C, T3);
    const grenzen = [naFactor, ...(laatsteVol !== null ? [laatsteVol + extraLaatste] : []), ...(prognose !== null ? [prognose] : [])];
    box1 = Math.max(0, Math.min(...grenzen));
    gem = jaarbasis;
    starterUit = { maanden: st.maanden, factor, jaarbasis, somInk, perioden: maanden, zonderStartjaar, prognose, laatsteVol };
    s.rij(`Starter: inkomen over ${maanden} werkelijke maanden${zonderStartjaar ? ` (zonder startjaar ${startY})` : ''}${cj?.heeft ? `, incl. ${C} gerealiseerd` : ''}`, { [T3]: cel(jaarbasis, `${g(rond(somInk))} / ${maanden} × 12 =`) });
    s.rij(`× ${pctT(factor)} (${defMaanden >= 24 ? '24' : '12'} maanden definitieve cijfers)`, { [T3]: cel(naFactor, `${g(jaarbasis)} × ${pctT(factor)} =`) });
    if (laatsteVol !== null) s.rij('Maximaal het laatste volledige boekjaar', { [T3]: cel(laatsteVol + extraLaatste) });
    if (prognose !== null) s.rij('Prognose (kan alleen verlagen)', { [T3]: cel(prognose) });
    s.rij('Inkomen starter', { [T3]: cel(box1, laagsteF(grenzen.length > 1 ? grenzen : [grenzen[0], grenzen[0]])) }, { stijl: 'resultaat' });
    stappen.push(`Starter (${Math.floor(st.maanden)} maanden): ${pctT(factor)} van het gemiddelde over de werkelijke maanden.`);
    if (prognose === null) meldingen.push({ niveau: 'attentie', tekst: 'ASN §3.7: vraag een prognose van de vaste accountant of administrateur op (met de gerealiseerde cijfers van het lopende jaar en een toetsbare onderbouwing).' });
  } else if (vervanging && cj?.heeft) {
    // §3.6: vanaf 1 april het lopende jaar i.p.v. het oudste, op basis van het werkelijke aantal maanden; maximaal het laatste volledige jaar.
    const gemV = rond(((TOT[T[1]] + TOT[T3] + cj.cReal) / (24 + cj.maanden)) * 12);
    box1 = Math.min(gemV, capBox1);
    s.rij(`Gemiddelde met lopend jaar i.p.v. ${T[0]} (werkelijke maanden)`, { [T3]: cel(gemV, `(${g(TOT[T[1]])} + ${g(TOT[T3])} + ${g(cj.cReal)}) / ${24 + cj.maanden} × 12 =`) });
    s.rij('Maximaal het laatste volledige boekjaar (DGA: loon + resultaat na Vpb)', { [T3]: cel(box1, laagsteF([gemV, capBox1])) }, { stijl: 'resultaat' });
    stappen.push(`Het oudste jaar (${T[0]}) is vervangen door het gerealiseerde resultaat ${C} over ${cj.maanden} maanden.`);
    gem = gemV;
  } else {
    box1 = Math.min(gem, capBox1);
    s.rij('Gemiddeld inkomen in de toetsjaren', { [T3]: cel(gem, lijstF(T.map((y) => TOT[y]), 3)) });
    s.rij(extraLaatste ? 'Maximaal het laatste jaar (DGA: loon + resultaat na Vpb laatste jaar)' : 'Maximaal het laatste jaar', { [T3]: cel(box1, laagsteF([gem, capBox1])) }, { stijl: 'resultaat' });
  }
  if (cj?.heeft && !vervanging && !starter && cj.cExtr < box1) {
    meldingen.push({ niveau: 'attentie', tekst: `Het geëxtrapoleerde inkomen ${C} (${g(cj.cExtr)}) ligt onder het berekende inkomen (${g(box1)}). ASN kent geen verplichte toets op het lopende jaar: beoordeel de bestendigheid.` });
  }

  // Box 2 (§3.2) en begrenzing op loon + winst na Vpb (of dividend) van het laatste jaar
  const metBox2 = mee.filter((a) => a.box2 && a.box2.model === 'ASN');
  const box2 = metBox2.reduce((x, a) => x + num(a.box2.totaal), 0);
  const capTotaal = TOT[T3] + dga.reduce((x, a) => {
    const b2 = a.box2;
    if (!b2) return x + resLaatste(a);
    if (b2.minderheid) return x + resLaatste(a) + num(b2.capExtra);
    return x + num(b2.capExtra);
  }, 0);
  let totaal = box1 + box2;
  s.rij('Box 1 inkomen', { [T3]: cel(rond(box1)) }, { stijl: 'som' });
  if (box2 || metBox2.length) s.rij('Box 2 inkomen (winst na Vpb en dividend, §3.2)', { [T3]: cel(box2) });
  if (!starter && metBox2.length && totaal > capTotaal) {
    s.rij('Maximaal loon + winst na Vpb (of dividend) van het laatste jaar', { [T3]: cel(capTotaal, laagsteF([totaal, capTotaal])) }, { stijl: 'resultaat' });
    stappen.push(`Begrensd op loon plus winst na Vpb (of dividend) van het laatste jaar: ${g(capTotaal)}.`);
    totaal = capTotaal;
  }
  const d30 = dertigProcent(ld, kader, pers, T, totaal, s, stappen);
  totaal = Math.max(0, rond(d30.bedrag));
  s.rij('Totaal berekend inkomen', { [T3]: cel(totaal) }, { stijl: 'totaal' });

  if (!relevant && T.some((y) => pers[y].voorStartIngevuld)) {
    meldingen.push({ niveau: 'attentie', tekst: 'Loon vóór de start telt bij ASN alleen mee als de aanvrager partner werd in het bedrijf waar hij werknemer was, of leidinggevende was in de overgenomen onderneming (§3.4). Vink dit aan bij de aanvraag als het van toepassing is.' });
  }
  if (ld.meenemen && T.some((y) => pers[y].naastIngevuld)) {
    meldingen.push({ niveau: 'info', tekst: 'Loon naast de onderneming telt bij ASN niet mee in het zakelijk inkomen; het wordt met een werkgeversverklaring aangetoond.' });
  }
  return {
    perJaar: TOT, gemiddelde: gem, basis: box1, controleReal: cj?.cReal ?? null, controleExtr: cj?.cExtr ?? null, factor: cj?.factor ?? 1,
    vergelijking: null, box1: rond(box1), box2, berekend: totaal, toetsinkomen: totaal, stappen, toets30: d30.toets30, meldingen,
    perOnderneming: perOndernemingUit(mee, T, C), persoonlijk: pers, starter: starterUit, incident, capTotaal,
  };
}

// ---------------------------------------------------------------------------
// Knab (concept toetskader 2024.013)
// ---------------------------------------------------------------------------
export function totaalKNAB(dossier, analyses, ctx, trace) {
  const { T, C, vervanging, kader } = ctx;
  const T3 = T[2];
  const inst = dossier.instellingen || {};
  const ld = dossier.loondienst || {};
  const mee = analyses.filter((a) => a.meenemen);
  const jaren = C ? [...T, C] : [...T];
  const relevant = inst.relevantDienstverband === true;
  const pers = persoonlijkInkomen(dossier, jaren, kader, { voorStart: relevant });
  const ondJaar = (y, veld = 'totaal') => mee.reduce((s, a) => s + num(a.jaren[y]?.inkomen[veld]), 0);
  // B.4.1: dividend telt per jaar mee in het totaalinkomen, maximaal de winst vóór belasting × belang van dat jaar.
  const divDeel = (a, y) => Math.max(0, Math.min(num(a.jaren[y]?.ibOnd?.dividend), rond(Math.max(0, a.jaren[y]?.winst.RVBcor ?? 0) * (a.jaren[y]?.aandeel ?? a.aandeel))));
  const divJaar = (y) => mee.reduce((s, a) => s + (a.box2?.dividendInTotaal ? divDeel(a, y) : 0), 0);
  const TOT = {};
  T.forEach((y) => { TOT[y] = rond(ondJaar(y) + pers[y].totaal + divJaar(y)); });
  const cj0 = C ? controlejaarCijfers(mee, C, pers, T3, ondJaar) : null;
  // Dividend wordt niet geëxtrapoleerd: voor de toets op het lopende jaar telt het gemiddelde dividend mee.
  const divGem = rond(gemiddelde(T.map(divJaar)));
  const cj = cj0 && divGem ? { ...cj0, cExtr: cj0.cExtr + divGem, cReal: rond(cj0.cReal + divGem / (cj0.factor || 1)), metDividend: divGem } : cj0;
  const stappen = [];
  const meldingen = [];
  const st = starterInfo(mee);
  const starter = st.maanden < 36 && !relevant;

  const s = trace.sectie('Berekening inkomen Knab (1-2-3-methode)', {
    groep: 'inkomen', kolommen: jaren,
    kolomLabels: Object.fromEntries(jaren.map((y) => [y, y === C ? `${y} (controlejaar)` : String(y)])),
    richtlijn: 'B.1.1: (1 × oudste + 2 × middelste + 3 × laatste jaar) / 6, maximaal het laatste jaar en maximaal 10% boven het gewone gemiddelde; B.1.1.0: totaal maximaal 20% boven het NHG-inkomen. Lopend jaar conform NHG.',
  });
  rijPerOnderneming(s, mee, jaren, C);
  persRijen(s, pers, jaren);
  if (T.some((y) => divJaar(y))) s.rij('Dividend (per jaar, max. winst vóór belasting × belang)', Object.fromEntries(T.map((y) => [y, cel(divJaar(y))])));
  const totRij = Object.fromEntries(T.map((y) => [y, cel(TOT[y])]));
  if (cj) totRij[C] = cel(cj.cReal, 'gerealiseerd');
  s.rij('Totaal inkomen per jaar', totRij, { stijl: 'som' });

  const belet = beletVervangen(TOT, T, C, cj, inst, kader, starter);
  if (belet && !belet.fout) {
    s.rij(`Beletperiode ${belet.jaar} vervangen (D.1)`, { [belet.jaar]: cel(belet.nieuw, `${g(belet.oud)} → ${belet.bron}`) }, { stijl: 'resultaat' });
    stappen.push(`Beletperiode ${belet.jaar} (${belet.oorzaak || 'oorzaak niet vastgelegd'}) vervangen door het ${belet.bron}.`);
    if (!belet.motivatie) meldingen.push({ niveau: 'attentie', tekst: 'Knab D.1: leg de oorzaak, de verklaring van de boekhouder en de cijfers ná het belet (minimaal 6 maanden) reproduceerbaar vast.' });
  } else if (belet?.fout) meldingen.push({ niveau: 'attentie', tekst: `Beletperiode niet toegepast: ${belet.fout}` });

  let res;
  let gem;
  let basis;
  let starterUit = null;
  let vergelijking = null;
  if (st.maanden < 12) {
    res = 0; gem = 0; basis = 0;
    stappen.push('Korter dan 12 maanden actief: geen inkomen uit onderneming (B.2.1).');
  } else if (starter) {
    // B.2.2.2: gemiddelde over de periode als zelfstandige × 80% / 90%, maximaal het laatste jaar en de prognose.
    const startY = st.startY || T[0];
    const naJuli = st.start && st.start.slice(5) > '07-01';
    let jarenIn = T.filter((y) => y >= startY);
    if (naJuli && jarenIn.length > 1) jarenIn = jarenIn.filter((y) => y !== startY);
    gem = rond(gemiddelde(jarenIn.map((y) => TOT[y])));
    const sf = starterFactor(kader, st.maanden);
    const naFactor = rond(gem * sf.factor);
    const prognose = prognoseVan(mee, dossier, C, T3);
    const grenzen = [naFactor, TOT[T3], ...(prognose !== null ? [prognose] : [])];
    res = Math.max(0, Math.min(...grenzen));
    basis = res;
    starterUit = { maanden: st.maanden, factor: sf.factor, gemiddelde: gem, prognose, jaren: jarenIn, startjaarUitgesloten: naJuli && jarenIn.length < T.filter((y) => y >= startY).length };
    s.rij(`Starter: gemiddelde over ${jarenIn.join(', ')}${starterUit.startjaarUitgesloten ? ` (startjaar ${startY} na 1 juli niet meegeteld)` : ''}`, { [T3]: cel(gem, lijstF(jarenIn.map((y) => TOT[y]), jarenIn.length || 1)) });
    s.rij(`× ${pctT(sf.factor)} (${sf.label})`, { [T3]: cel(naFactor) });
    s.rij('Laagste van starterinkomen, laatste jaar en prognose', { [T3]: cel(res, laagsteF(grenzen)) }, { stijl: 'resultaat' });
    stappen.push(`Starter zonder relevant voorafgaand dienstverband (${Math.floor(st.maanden)} maanden): ${pctT(sf.factor)} van het gemiddelde; de 10%- en 20%-grens gelden niet.`);
    if (prognose === null) meldingen.push({ niveau: 'attentie', tekst: `Knab B.2.3: vraag een prognose op (NBA-standaard 3400) over ${st.maanden < 24 ? 'het lopende en het komende jaar' : 'het lopende jaar'}.` });
  } else {
    const m = gewogen123(T.map((y) => TOT[y]), kader.methode123.maxBoven111);
    gem = m.A;
    basis = m.uit;
    s.rij('Gewogen inkomen 1-2-3', { [T3]: cel(m.W, m.fW) });
    s.rij(`Gewoon gemiddelde (1-1-1) + ${pctT(kader.methode123.maxBoven111)}`, { [T3]: cel(m.capA, `${lijstF(T.map((y) => TOT[y]), 3)} ${g(m.A)} × ${String(1 + kader.methode123.maxBoven111).replace('.', ',')}`) });
    s.rij('Basisinkomen: laagste van 1-2-3, 1-1-1 + 10% en het laatste jaar', { [T3]: cel(basis, laagsteF([m.W, m.capA, TOT[T3]])) }, { stijl: 'resultaat' });
    res = basis;
    if (cj?.heeft && !vervanging) {
      s.rij('Geëxtrapoleerd inkomen lopend jaar (EI)', { [C]: cel(cj.cExtr, cj.metDividend ? `${g(cj0.cReal)} × ${String(cj.factor).replace('.', ',')} + gemiddeld dividend ${g(cj.metDividend)} =` : `${g(cj.cReal)} × ${String(cj.factor).replace('.', ',')} =`) });
      if (cj.cExtr < basis) { res = cj.cExtr; stappen.push('Het geëxtrapoleerde inkomen in het lopende jaar is lager: het inkomen wordt naar beneden bijgesteld (B.1.3.3).'); }
      s.rij('Inkomen na toets lopend jaar', { [C]: cel(res, laagsteF([basis, cj.cExtr])) }, { stijl: 'resultaat' });
    }
    if (vervanging && cj?.heeft) {
      // B.1.3.4: vervangen conform NHG; het vervangende jaar telt 3×; maximaal 10% boven 1-1-1.
      const mv = gewogen123([TOT[T[1]], TOT[T3], cj.cReal], kader.methode123.maxBoven111);
      const B = Math.min(mv.W, mv.capA);
      const last = TOT[T3];
      const a = last < B && last > cj.cReal ? last : B;
      let s1 = cj.cReal < B ? cj.cReal : B;
      if (last > B) s1 = B;
      const d = cj.cExtr < B ? cj.cExtr : B;
      res = Math.min(a, s1, d);
      vergelijking = { zonder: Math.min(basis, cj.cExtr), met: res };
      s.rij(`Vervanging: (1 × ${T[1]} + 2 × ${T3} + 3 × ${C} gerealiseerd) / 6, max. 1-1-1 + 10%`, { [T3]: cel(rond(B), `${mv.fW} ${g(mv.W)}; ${laagsteF([mv.W, mv.capA])}`) });
      s.rij('Inkomen na vervanging (stappen a, b en d conform NHG)', { [T3]: cel(res, laagsteF([a, s1, d])) }, { stijl: 'resultaat' });
      stappen.push(`Vervanging toegepast: ${T[0]} is vervangen door het gerealiseerde resultaat ${C} (weegt 3×).`);
    }
    // B.1.1.0: maximaal 20% boven het NHG-inkomen
    const nhg = ctx.nhgReferentie;
    if (nhg !== null && nhg !== undefined && kader.methode123.maxBovenNHG !== null) {
      const maxN = rond(nhg * (1 + kader.methode123.maxBovenNHG));
      s.rij(`Maximaal ${pctT(kader.methode123.maxBovenNHG)} boven het NHG-inkomen (${g(nhg)})`, { [T3]: cel(maxN) });
      if (res > maxN) { stappen.push(`Begrensd op ${pctT(kader.methode123.maxBovenNHG)} boven het NHG-inkomen.`); res = maxN; }
    }
  }
  if (belet && !belet.fout && belet.maxNa !== null && belet.maxNa !== undefined && res > belet.maxNa) {
    s.rij('Maximaal het inkomen na het belet', { [T3]: cel(belet.maxNa) }, { stijl: 'resultaat' });
    res = belet.maxNa;
  }

  // Box 2: overwinst (route 2) per onderneming; bij de combinatieroute samen met het dividend maximaal 75% van de gemiddelde winst.
  let box2 = 0;
  mee.filter((a) => a.box2).forEach((a) => {
    let b2 = num(a.box2.totaal);
    if (b2 && a.box2.dividendInTotaal) {
      const gemDiv = rond(gemiddelde(T.map((y) => divDeel(a, y))));
      const ruimte = Math.max(0, num(a.box2.capCombinatie) - gemDiv);
      if (b2 > ruimte) { stappen.push(`${a.naam}: dividend en overwinst samen maximaal 75% van de gemiddelde winst (${g(a.box2.capCombinatie)}).`); b2 = ruimte; }
    }
    box2 += b2;
  });
  let box1 = Math.max(0, rond(res));
  s.rij('Box 1 inkomen (incl. dividend per jaar)', { [T3]: cel(box1) }, { stijl: 'som' });
  if (mee.some((a) => a.soort === 'VPB')) s.rij('Box 2: overwinst na dubbele balanstoets', { [T3]: cel(box2) });
  let totaal = box1 + box2;
  const d30 = dertigProcent(ld, kader, pers, T, totaal, s, stappen);
  totaal = Math.max(0, rond(d30.bedrag));
  box1 = Math.max(0, totaal - box2);
  s.rij('Totaal berekend inkomen', { [T3]: cel(totaal) }, { stijl: 'totaal' });

  const trend = !starter ? trendSignaal(T.map((y) => TOT[y]), kader) : null;
  if (trend) meldingen.push({ niveau: 'attentie', tekst: `Knab B.1.2.1: dalende trend (${pctT(trend.dO)} van ${T[0]} naar ${T3}, ${pctT(trend.dM)} van ${T[1]} naar ${T3}). Onderbouwing nodig: verklaring van de boekhouder over de oorzaak en een prognose volgens NBA 3400; de daling moet zijn gestopt.` });
  if (ld.meenemen) {
    const loon = T.map((y) => num((dossier.ib?.[y] || {}).naast));
    if (loon[2] > loon[1] || loon[2] > loon[0]) meldingen.push({ niveau: 'attentie', tekst: 'Knab B.1.4.3: het looninkomen naast de onderneming is gestegen; neem het niet mee in het zakelijk inkomen maar toon het aan met een werkgeversverklaring.' });
  }
  if (!relevant && T.some((y) => pers[y].voorStartIngevuld)) {
    meldingen.push({ niveau: 'info', tekst: 'Loon vóór de start telt bij Knab alleen mee bij een relevant voorafgaand dienstverband (zelfde branche én vergelijkbare activiteiten, B.2.2.1). Vink dit aan bij de aanvraag als het van toepassing is.' });
  }
  return {
    perJaar: TOT, gemiddelde: gem, basis, controleReal: cj?.cReal ?? null, controleExtr: cj?.cExtr ?? null, factor: cj?.factor ?? 1,
    vergelijking, box1, box2, berekend: totaal, toetsinkomen: totaal, stappen, toets30: d30.toets30, meldingen,
    perOnderneming: perOndernemingUit(mee, T, C), persoonlijk: pers, starter: starterUit, belet, nhgReferentie: ctx.nhgReferentie ?? null,
  };
}

// ---------------------------------------------------------------------------
// Optimaal (ZIB-ontwerp)
// ---------------------------------------------------------------------------
/**
 * Economisch inkomen per jaar: box 1 + aandeel in de winst na Vpb van vennootschappen met zeggenschap
 * (look-through) + bestendig dividend uit minderheidsbelangen. Daarna: 1-2-3-weging (max. 10% boven het
 * gemiddelde en max. het laatste jaar), het lopende jaar naar rato van de lengte van de periode, begrenzing
 * van ingehouden winst op de uitkeerbare ruimte, een afslag voor beweeglijkheid en de starterregels.
 * @param {object} ctx  ctx.minderheid: [{ id, naam, perJaar, trackrecord, cap, ... }]
 */
export function totaalOPT(dossier, analyses, ctx, trace) {
  const { T, C, kader } = ctx;
  const T3 = T[2];
  const inst = dossier.instellingen || {};
  const ld = dossier.loondienst || {};
  const mee = analyses.filter((a) => a.meenemen);
  const jaren = C ? [...T, C] : [...T];
  const relevant = inst.relevantDienstverband === true;
  const pers = persoonlijkInkomen(dossier, jaren, kader, { voorStart: relevant });
  const ondJaar = (y, veld = 'totaal') => mee.reduce((s, a) => s + num(a.jaren[y]?.inkomen[veld]), 0);
  const cj = C ? controlejaarCijfers(mee, C, pers, T3, ondJaar) : null;
  const stappen = [];
  const meldingen = [];
  const st = starterInfo(mee);
  const starter = st.maanden < 36;

  const look = mee.filter((a) => a.box2?.model === 'OPT' && a.box2.keten);
  const minderheid = (ctx.minderheid || []).filter((m) => m.meetellen);
  const B1 = {};
  const PL = {};
  const MD = {};
  const E = {};
  T.forEach((y) => {
    B1[y] = rond(ondJaar(y) + pers[y].totaal);
    PL[y] = look.reduce((s, a) => s + num(a.box2.P[y]), 0);
    MD[y] = minderheid.reduce((s, m) => s + num(m.perJaar[y]), 0);
    E[y] = B1[y] + PL[y] + MD[y];
  });
  // Lopend jaar: box 1 en winstaandelen geëxtrapoleerd; dividend uit minderheidsbelangen niet (onregelmatig), dus het gemiddelde.
  const EC = cj?.heeft ? rond(cj.cExtr + look.reduce((s, a) => s + num(a.box2.P[C]), 0) + minderheid.filter((m) => m.trackrecord).reduce((s, m) => s + num(m.gemiddelde), 0)) : null;

  const s = trace.sectie('Berekening inkomen Optimaal', {
    groep: 'inkomen', kolommen: jaren,
    kolomLabels: Object.fromEntries(jaren.map((y) => [y, y === C ? `${y} (geëxtrapoleerd)` : String(y)])),
    richtlijn: 'Economisch inkomen = box 1 + aandeel in de winst na Vpb van vennootschappen met zeggenschap (zonder resultaat deelnemingen) + bestendig dividend uit minderheidsbelangen. Weging 1-2-3, maximaal 10% boven het gemiddelde en maximaal het laatste jaar.',
  });
  rijPerOnderneming(s, mee, jaren, C, 'totaal');
  persRijen(s, pers, jaren);
  look.forEach((a) => s.rij(`Aandeel winst na Vpb ${a.naam} (belang ${p(ctx.belangVan?.(a.id, T3) ?? a.aandeel)})`, Object.fromEntries(jaren.map((y) => [y, cel(num(a.box2.P[y]))]))));
  minderheid.forEach((m) => s.rij(`Dividend minderheidsbelang ${m.naam}${m.trackrecord ? '' : ' (geen trackrecord: telt niet)'}`, Object.fromEntries(T.map((y) => [y, cel(num(m.perJaar[y]))]))));
  const eRij = Object.fromEntries(T.map((y) => [y, cel(E[y])]));
  if (EC !== null) eRij[C] = cel(EC, 'geëxtrapoleerd');
  s.rij('Economisch inkomen per jaar', eRij, { stijl: 'som' });

  const belet = beletVervangen(E, T, C, cj ? { ...cj, cExtr: EC } : null, inst, kader, starter);
  if (belet && !belet.fout) {
    s.rij(`Beletperiode ${belet.jaar} vervangen`, { [belet.jaar]: cel(belet.nieuw, `${g(belet.oud)} → ${belet.bron}`) }, { stijl: 'resultaat' });
    stappen.push(`Beletperiode ${belet.jaar} (${belet.oorzaak || 'oorzaak niet vastgelegd'}) vervangen door het ${belet.bron}.`);
  } else if (belet?.fout) meldingen.push({ niveau: 'attentie', tekst: `Beletperiode niet toegepast: ${belet.fout}` });

  const w = T.map((y) => E[y]);
  let basis;
  let gem;
  let starterUit = null;
  if (st.maanden < 12) {
    basis = 0; gem = 0;
    stappen.push('Korter dan 12 maanden ondernemer: (nog) geen bestendig inkomen.');
  } else if (starter) {
    const startY = st.startY || T[0];
    const naJuli = st.start && st.start.slice(5) > '07-01';
    let jarenIn = T.filter((y) => y >= startY);
    if (naJuli && jarenIn.length > 1) jarenIn = jarenIn.filter((y) => y !== startY);
    gem = rond(gemiddelde(jarenIn.map((y) => E[y])));
    const sf = relevant ? { factor: 1, label: 'relevante ervaring in dezelfde branche: geen afslag' } : (() => { const f = starterFactor(kader, st.maanden); return { factor: f.factor, label: f.label }; })();
    const prognose = prognoseVan(mee, dossier, C, T3);
    const grenzen = [rond(gem * sf.factor), E[T3], ...(prognose !== null ? [prognose] : [])];
    basis = Math.max(0, Math.min(...grenzen));
    starterUit = { maanden: st.maanden, factor: sf.factor, gemiddelde: gem, prognose, jaren: jarenIn };
    s.rij(`Starter: gemiddelde over ${jarenIn.join(', ')} × ${pctT(sf.factor)} (${sf.label})`, { [T3]: cel(rond(gem * sf.factor), `${lijstF(jarenIn.map((y) => E[y]), jarenIn.length || 1)} ${g(gem)} × ${pctT(sf.factor)}`) });
    s.rij('Laagste van starterinkomen, laatste jaar en prognose', { [T3]: cel(basis, laagsteF(grenzen)) }, { stijl: 'resultaat' });
    if (prognose === null) meldingen.push({ niveau: 'attentie', tekst: 'Optimaal: een starter heeft een prognose nodig (RA/AA of NBA 3400), opgebouwd uit werkvoorraad, contracten en toezeggingen.' });
  } else {
    const m = gewogen123(w, kader.methode123?.maxBoven111 ?? 0.10);
    gem = m.A;
    basis = m.uit;
    s.rij('Gewogen inkomen 1-2-3', { [T3]: cel(m.W, m.fW) });
    s.rij(`Gewoon gemiddelde + ${pctT(kader.methode123?.maxBoven111 ?? 0.10)}`, { [T3]: cel(m.capA, `${lijstF(w, 3)} ${g(m.A)} × ${String(1 + (kader.methode123?.maxBoven111 ?? 0.10)).replace('.', ',')}`) });
    s.rij('Basis: laagste van 1-2-3, gemiddelde + 10% en het laatste jaar', { [T3]: cel(basis, laagsteF([m.W, m.capA, w[2]])) }, { stijl: 'resultaat' });
  }

  // Lopend jaar: een lager geëxtrapoleerd inkomen weegt mee naar rato van de lengte van de periode.
  let naC = basis;
  let wegingC = null;
  if (EC !== null && cj.maanden > 0 && EC < basis) {
    const cw = kader.controlejaarWeging || { vanafMaanden: 3, volledigVanaf: 9 };
    wegingC = Math.max(0, Math.min(1, (cj.maanden - cw.vanafMaanden) / Math.max(1, cw.volledigVanaf - cw.vanafMaanden)));
    naC = rond(basis - wegingC * (basis - EC));
    s.rij(`Lopend jaar lager: ${String(Math.round(cj.maanden * 10) / 10).replace('.', ',')} maanden weegt ${pctT(wegingC)}`, { [C]: cel(naC, `${g(basis)} - ${pctT(wegingC)} × (${g(basis)} - ${g(EC)}) =`) }, { stijl: 'resultaat' });
    if (wegingC < 1) stappen.push(`Het lagere lopende jaar (${g(EC)}) weegt voor ${pctT(wegingC)} mee: de periode is ${String(Math.round(cj.maanden * 10) / 10).replace('.', ',')} maanden.`);
  }

  // Ingehouden winst alleen voor zover uitkeerbaar
  let reductie = 0;
  const uitkeerbaar = [];
  look.forEach((a) => {
    const reeks = T.map((y) => num(a.box2.P[y]));
    const wP = starter ? rond(gemiddelde(reeks)) : gewogen123(reeks, kader.methode123?.maxBoven111 ?? 0.10).uit;
    const over = Math.max(0, wP - a.box2.capaciteit);
    uitkeerbaar.push({ id: a.id, naam: a.naam, gewogen: wP, capaciteit: a.box2.capaciteit, over });
    if (over > 0) {
      reductie += over;
      s.rij(`${a.naam}: winstaandeel boven de uitkeerbare ruimte`, { [T3]: cel(-over, `${g(wP)} - ${g(a.box2.capaciteit)} =`) });
      stappen.push(`${a.naam}: ${g(over)} ingehouden winst kan niet worden uitgekeerd zonder de normen te raken (dubbele balanstoets / vrije reserves) en telt niet mee.`);
    }
  });
  let naDbt = Math.max(0, rond(naC - reductie));
  if (reductie) s.rij('Na begrenzing op de uitkeerbare ruimte', { [T3]: cel(naDbt) }, { stijl: 'resultaat' });

  // Beweeglijkheid
  const vol = kader.volatiliteit || { drempel: 0.2, factor: 0.5, max: 0.25 };
  const reeksV = (starter ? T.filter((y) => !st.startY || y >= st.startY) : T).map((y) => E[y]);
  const mu = gemiddelde(reeksV);
  const sd = reeksV.length > 1 ? Math.sqrt(reeksV.reduce((x, v) => x + (v - mu) ** 2, 0) / reeksV.length) : 0;
  const cv = mu > 0 ? sd / mu : 0;
  const afslagV = mu > 0 ? Math.min(vol.max, Math.max(0, (cv - vol.drempel) * vol.factor)) : 0;
  let totaal = naDbt;
  s.rij('Beweeglijkheid (variatiecoëfficiënt)', { [T3]: cel(Math.round(cv * 1000) / 1000, `σ ${g(rond(sd))} / gemiddelde ${g(rond(mu))}`, 'pct') });
  if (afslagV > 0) {
    totaal = rond(naDbt * (1 - afslagV));
    s.rij(`Afslag beweeglijkheid (${pctT(afslagV)})`, { [T3]: cel(totaal, `${g(naDbt)} × (1 - ${pctT(afslagV)}) =`) }, { stijl: 'resultaat' });
    stappen.push(`Afslag van ${pctT(afslagV)} voor beweeglijkheid (variatiecoëfficiënt ${pctT(cv)}, drempel ${pctT(vol.drempel)}).`);
  }
  if (belet && !belet.fout && belet.maxNa !== null && belet.maxNa !== undefined && totaal > belet.maxNa) {
    totaal = belet.maxNa;
    s.rij('Maximaal het inkomen na het belet', { [T3]: cel(totaal) }, { stijl: 'resultaat' });
  }
  const d30 = dertigProcent(ld, kader, pers, T, totaal, s, stappen);
  totaal = Math.max(0, rond(d30.bedrag));
  s.rij('Totaal bestendig inkomen (Optimaal)', { [T3]: cel(totaal) }, { stijl: 'totaal' });

  // Uitsplitsing voor de overzichten
  const box2Gewogen = look.reduce((x, a) => {
    const u = uitkeerbaar.find((z) => z.id === a.id);
    return x + Math.max(0, Math.min(u.gewogen, u.capaciteit));
  }, 0) + minderheid.filter((m) => m.trackrecord).reduce((x, m) => x + Math.max(0, Math.min(m.gemiddelde, num(m.perJaar[T3]))), 0);
  const box2 = Math.min(totaal, rond(box2Gewogen));
  const ingehouden = look.reduce((x, a) => {
    const u = uitkeerbaar.find((z) => z.id === a.id);
    return x + Math.max(0, Math.min(u.gewogen, u.capaciteit) - num(a.box2.gemD));
  }, 0);
  if (totaal > 0 && ingehouden / totaal > 0.5) {
    meldingen.push({ niveau: 'attentie', tekst: `Optimaal: ${pctT(ingehouden / totaal)} van het inkomen is ingehouden winst. Leg vast dat die ook wordt uitgekeerd (dividendbeleid, aandeelhoudersbesluit) of dat de ondernemer dat zelfstandig kan beslissen.` });
  }
  const trend = !starter ? trendSignaal(w, kader) : null;
  if (trend) meldingen.push({ niveau: 'attentie', tekst: `Optimaal: dalende trend (${pctT(trend.dO)} van ${T[0]} naar ${T3}). Laat met een prognose zien dat de daling is gestopt.` });
  if (!relevant && T.some((y) => pers[y].voorStartIngevuld)) {
    meldingen.push({ niveau: 'info', tekst: 'Loon vóór de start telt in Optimaal alleen mee bij aantoonbaar relevante ervaring in dezelfde branche (vink dit aan bij de aanvraag).' });
  }
  return {
    perJaar: E, gemiddelde: gem, basis, controleReal: cj?.cReal ?? null, controleExtr: EC, factor: cj?.factor ?? 1, vergelijking: null,
    box1: Math.max(0, totaal - box2), box2, berekend: totaal, toetsinkomen: totaal, stappen, toets30: d30.toets30, meldingen,
    perOnderneming: perOndernemingUit(mee, T, C).map((o) => ({ ...o, box2: rond(gemiddelde(T.map((y) => num(look.find((a) => a.id === o.id)?.box2.P[y])))) })),
    persoonlijk: pers, starter: starterUit, belet,
    optimaal: { box1PerJaar: B1, lookPerJaar: PL, minderheidPerJaar: MD, wegingC, reductie, uitkeerbaar, cv, afslagV, naC, naDbt },
  };
}
