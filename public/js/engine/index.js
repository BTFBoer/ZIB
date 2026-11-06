import { KADERS, KADER_VOLGORDE, kaderVoor } from './kaders.js';
import * as P from './periods.js';
import { analyseerOnderneming, box2NHG, box2ABN, box2ASN, box2OPT, slechtste } from './onderneming.js';
import { dertigProcentToets, totaalASN, totaalKNAB, totaalOPT } from './totaal.js';
import { beoordeelNul, zkLijst } from './nul.js';
import { Trace, cel, g, p, lijstF, laagsteF } from './trace.js';
import { documentenlijst } from '../schema/documenten.js';
import { totalenJaar } from './financieel.js';
import { num, rond, rond2, gemiddelde, isIngevuld, todayISO, naamAanvrager } from '../util.js';

export { KADERS, KADER_VOLGORDE, kaderVoor } from './kaders.js';
export { dertigProcentToets } from './totaal.js';

/** Standaard laatste toetsjaar: na de datum waarop definitieve cijfers verplicht zijn het vorige jaar. */
export function standaardLaatsteToetsjaar(kaderId, datum, vorigJaarDefinitief = false) {
  const kader = typeof kaderId === 'object' && kaderId ? kaderId : (KADERS[kaderId] || KADERS.NHG);
  const jaar = P.jaarVan(datum);
  const na = P.opOfNa(datum, kader.definitiefVerplichtVanaf.m, kader.definitiefVerplichtVanaf.d);
  return na || vorigJaarDefinitief ? jaar - 1 : jaar - 2;
}

export function bepaalJaren(dossier) {
  const kader = kaderVoor(dossier);
  const datum = dossier.berekeningsdatum || todayISO();
  const inst = dossier.instellingen || {};
  const T3 = num(inst.laatsteToetsjaar) || standaardLaatsteToetsjaar(kader, datum);
  const T = [T3 - 2, T3 - 1, T3];
  const kandidaat = T3 + 1;
  const ib = dossier.ib?.[kandidaat] || dossier.ib?.[String(kandidaat)];
  const heeftData = (dossier.ondernemingen || []).some((o) => {
    const j = o.jaren?.[kandidaat] || o.jaren?.[String(kandidaat)];
    if (!j) return false;
    const t = totalenJaar(j);
    return t.heeftVW || t.heeftBalans;
  }) || (ib && Object.values(ib.perOnd || {}).some((x) => isIngevuld(x?.loon)));
  const C = inst.controlejaar === false || !heeftData ? null : kandidaat;
  return { kader, datum, jaarNu: P.jaarVan(datum), T, T3, C, kandidaatC: kandidaat };
}

export function berekenRC(rc = {}) {
  const saldo = num(rc.saldo);
  const rente = num(rc.rente);
  if (!saldo) return { maandlast: 0, tekst: '' };
  const gedragscode = rond((num(rc.limiet) || saldo) * 0.02);
  if (rc.kasrondje) return { maandlast: 0, saldo, rente, gedragscode, tekst: 'Kasrondje aangetoond (verklaring accountant en aangifte dividendbelasting): geen maandlast meenemen.' };
  if (rc.onderDrempel) return { maandlast: 0, saldo, rente, gedragscode, tekst: 'Saldo het hele boekjaar onder € 17.500: geen wettelijke rentevergoeding, geen maandlast meenemen.' };
  const maandlast = rond((saldo * rente) / 100 / 12);
  return {
    maandlast, saldo, rente, gedragscode, explain: !!rc.explain,
    tekst: `${g(saldo)} × ${String(rente).replace('.', ',')}% / 12 = ${g(maandlast)} per maand${rc.explain ? ' (explain: afbouw R/C, betrek een Explain-expert)' : ''}.`,
  };
}

/** Annuïteit per maand (hoofdsom, rente in % per jaar, looptijd in maanden). */
export function annuiteit(hoofdsom, rentePct, maanden) {
  const H = num(hoofdsom);
  const n = num(maanden);
  const rm = num(rentePct) / 100 / 12;
  if (!H || !n) return 0;
  if (!rm) return H / n;
  return (H * rm) / (1 - (1 + rm) ** -n);
}

/** Lening van de BV aan de DGA (lening directie): maandlast in privé. */
export function berekenLeningDirectie(ld = {}) {
  const hoofdsom = num(ld.hoofdsom);
  if (!hoofdsom) return { maandlast: 0, tekst: '' };
  const vast = isIngevuld(ld.termijn) ? num(ld.termijn) : null;
  const berekend = rond2(annuiteit(hoofdsom, ld.rente, ld.looptijdMnd));
  const maandlast = vast ?? berekend;
  const rente = String(num(ld.rente)).replace('.', ',');
  return {
    maandlast, berekend, hoofdsom,
    tekst: vast !== null
      ? `Contractuele termijn ${g(vast)} per maand (berekende annuïteit ${fmtCent(berekend)}).`
      : `Annuïteit ${g(hoofdsom)} tegen ${rente}% over ${num(ld.looptijdMnd)} maanden = ${fmtCent(berekend)} per maand.`,
  };
}

function fmtCent(x) {
  return `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x)}`;
}

/**
 * Salaris lopend jaar uit de salarisstrook: maandsalaris × 12 × (1 + vakantietoeslag) [+ 13e maand]
 * / 12 × aantal maanden. Zo wordt het DGA-inkomen over dezelfde periode als de tussentijdse cijfers bepaald.
 */
export function salarisPeriode({ maandsalaris, vakantiegeldPct = 8, dertiendeMaand = false, maanden = 12 } = {}) {
  const m = num(maandsalaris);
  const jaar = m * 12 * (1 + num(vakantiegeldPct) / 100) + (dertiendeMaand ? m : 0);
  const bedrag = rond((jaar / 12) * num(maanden));
  const f = `${g(m)} × 12 × ${String(1 + num(vakantiegeldPct) / 100).replace('.', ',')}${dertiendeMaand ? ` + ${g(m)}` : ''} / 12 × ${num(maanden)} = ${g(bedrag)}`;
  return { jaar: rond(jaar), bedrag, f };
}

// ---------------------------------------------------------------------------
// Structuur: hoofdbedrijven, (geneste) deelnemingen, indirecte belangen en organogram
// ---------------------------------------------------------------------------
function pctUit(v, standaard = 100) {
  const x = isIngevuld(v) ? num(v) : standaard;
  return Math.min(1, Math.max(0, x / 100));
}

/** Belang van de (primaire) aandeelhouder in een onderneming in jaar y: het percentage van dat jaar, anders het basispercentage. */
function belangInJaar(o, y) {
  const jd = o.jaren?.[y] || o.jaren?.[String(y)];
  return isIngevuld(jd?.aandeelPct) ? pctUit(jd.aandeelPct) : pctUit(o.aandeelPct);
}

/** Een extra aandeelhouder (gedeelde deelneming) telt alleen in de jaren waarin het belang bestond (vanaf/tot). */
function extraActief(x, y) {
  const van = num(x.vanaf);
  const tot = num(x.tot);
  return (!van || y >= van) && (!tot || y <= tot);
}

export function structuur(dossier) {
  const onds = dossier.ondernemingen || [];
  const byId = new Map(onds.map((o) => [o.id, o]));
  const links = [];
  onds.forEach((o) => {
    if (o.parentId && byId.has(o.parentId) && o.parentId !== o.id) {
      links.push({ kind: o.id, ouder: o.parentId, pct: pctUit(o.aandeelPct), pctJaar: (y) => belangInJaar(o, y) });
    }
    (o.extraParents || []).forEach((x) => {
      if (x?.id && byId.has(x.id) && x.id !== o.id && x.id !== o.parentId) {
        links.push({ kind: o.id, ouder: x.id, pct: pctUit(x.pct), extra: true, vanaf: num(x.vanaf) || null, tot: num(x.tot) || null,
          pctJaar: (y) => (extraActief(x, y) ? pctUit(x.pct) : 0) });
      }
    });
  });
  const kinderen = (id) => links.filter((l) => l.ouder === id);
  const afstammelingen = (id, pct, pctJ, pad, diepte) => {
    const uit = [];
    kinderen(id).forEach((l) => {
      if (pad.has(l.kind)) return;
      const indirect = pct * l.pct;
      const indirectJaar = (y) => pctJ(y) * l.pctJaar(y);
      uit.push({ id: l.kind, via: id, pct: l.pct, indirect, indirectJaar, pctJaar: l.pctJaar, diepte, extra: !!l.extra });
      uit.push(...afstammelingen(l.kind, indirect, indirectJaar, new Set([...pad, l.kind]), diepte + 1));
    });
    return uit;
  };
  const hoofden = onds.filter((o) => !o.parentId || !byId.has(o.parentId)).map((o) => {
    const ez = o.rechtsvorm === 'EZ';
    const eigen = ez ? 1 : pctUit(o.aandeelPct);
    const eigenJaar = (y) => (ez ? 1 : belangInJaar(o, y));
    return { id: o.id, pct: eigen, pctJaar: eigenJaar, afstammelingen: afstammelingen(o.id, eigen, eigenJaar, new Set([o.id]), 1) };
  });
  return { hoofden, links, kinderen };
}

/**
 * Economisch belang en zeggenschap per onderneming per jaar, over alle paden in de structuur.
 * - belangJaar(y): het totale economische belang van de aanvrager (alle paden);
 * - belangInkomenJaar(y): alleen via ondernemingen die voor het inkomen meetellen (niet via een holding met 0-inkomen);
 * - keten: zeggenschap, ook als die via meer eigen vennootschappen samen ontstaat (bijv. 30% + 30% via twee
 *   eigen holdings = 60%). Een aangetoonde zeggenschap (dividendbeleid) telt alleen als de aandeelhouder zelf
 *   zeggenschap heeft.
 * @param {{telt?: (id:string)=>boolean, jaar?: number}} opties
 */
export function belangen(dossier, st = structuur(dossier), { telt = () => true, jaar } = {}) {
  const onds = dossier.ondernemingen || [];
  const byId = new Map(onds.map((o) => [o.id, o]));
  const hoofdIds = new Set(st.hoofden.map((h) => h.id));
  const pctL = (l) => (jaar && l.pctJaar ? l.pctJaar(jaar) : l.pct);
  // Zeggenschap: hoofdbedrijven direct, daarna herhaald over de deelnemingen tot er niets meer verandert.
  const keten = new Map();
  st.hoofden.forEach((h) => {
    const o = byId.get(h.id);
    const pct = jaar && h.pctJaar ? h.pctJaar(jaar) : h.pct;
    keten.set(h.id, o?.rechtsvorm === 'EZ' || pct > 0.5 || o?.zeggenschap === true);
  });
  for (let n = 0, gewijzigd = true; gewijzigd && n < 12; n += 1) {
    gewijzigd = false;
    onds.forEach((o) => {
      if (hoofdIds.has(o.id)) return;
      const inn = st.links.filter((l) => l.kind === o.id);
      const share = inn.reduce((s, l) => s + (keten.get(l.ouder) ? pctL(l) : 0), 0);
      const k = share > 0.5 || (o.zeggenschap === true && inn.some((l) => keten.get(l.ouder)));
      if (keten.get(o.id) !== k) { keten.set(o.id, k); gewijzigd = true; }
    });
  }
  const uit = new Map();
  const voeg = (id, fn, fnInkomen, via) => {
    const x = uit.get(id) || { id, paden: [] };
    x.paden.push({ fn, fnInkomen, via });
    uit.set(id, x);
  };
  st.hoofden.forEach((h) => {
    const hTelt = telt(h.id);
    voeg(h.id, h.pctJaar, (y) => (hTelt ? h.pctJaar(y) : 0), null);
    // Per pad: telt het pad mee voor het inkomen (alle tussenliggende ondernemingen tellen mee)?
    const padTelt = new Map([[h.id, hTelt]]);
    h.afstammelingen.forEach((a) => {
      const pt = (padTelt.get(a.via) ?? false) && telt(a.id);
      padTelt.set(a.id, pt);
      const fnI = (y) => (pt ? a.indirectJaar(y) : 0);
      voeg(a.id, a.indirectJaar, fnI, a.via);
    });
  });
  uit.forEach((x) => {
    x.keten = !!keten.get(x.id);
    x.belangJaar = (y) => Math.min(1, x.paden.reduce((s, pd) => s + pd.fn(y), 0));
    x.belangInkomenJaar = (y) => Math.min(1, x.paden.reduce((s, pd) => s + pd.fnInkomen(y), 0));
  });
  return uit;
}

// Overige knopen in het organogram: personen (medeaandeelhouders, certificaathouders), een STAK of
// vennootschappen buiten de berekening. Ze tellen niet mee in het inkomen of het toetskader, maar maken
// de structuur compleet (wie houdt de overige aandelen) en dienen als tegenpartij bij geldstromen.
export const KNOOP_SOORTEN = {
  persoon: 'Persoon',
  stak: 'STAK (stichting administratiekantoor)',
  bv: 'Vennootschap buiten de berekening',
  overig: 'Overig',
};

const pctTekst = (x) => `${Math.round(x * 1000) / 10}%`.replace('.', ',');

/** Volledige graaf voor het organogram: aanvrager, ondernemingen in de berekening en overige knopen. */
export function organogramGraaf(dossier) {
  const onds = dossier.ondernemingen || [];
  const og = dossier.organogram || {};
  const extern = (og.knopen || []).filter((k) => k && k.id);
  const ids = new Set(['aanvrager', ...onds.map((o) => o.id), ...extern.map((k) => k.id)]);
  const lijnenExtern = (og.lijnen || []).filter((l) => l && ids.has(l.van) && ids.has(l.naar) && l.van !== l.naar);
  const byOnd = new Map(onds.map((o) => [o.id, o]));
  const knopen = [
    { id: 'aanvrager', soort: 'persoon', naam: naamAanvrager(dossier.aanvrager) || 'Aanvrager', sub: 'Aanvrager', rol: 'aanvrager' },
    ...onds.map((o) => ({ id: o.id, soort: 'onderneming', naam: o.naam || '(naamloos)', rol: 'analyse',
      sub: [o.rechtsvorm === 'BV' || o.rechtsvorm === 'NV' ? '' : o.rechtsvorm, o.activiteit].filter(Boolean).join(' · ') })),
    ...extern.map((k) => ({ id: k.id, soort: KNOOP_SOORTEN[k.soort] ? k.soort : 'overig', naam: k.naam || '(naamloos)', sub: k.toelichting || '', rol: 'extern' })),
  ];
  const st = structuur(dossier);
  const lijnen = [];
  const metExternIn = new Set(lijnenExtern.map((l) => l.naar));
  // Houdt de aanvrager een hoofdbedrijf zelf via een getekende lijn of via partijen buiten de
  // berekening (bijv. certificaten van een STAK die de aandelen houdt)? Dan geen automatische lijn.
  const externIds = new Set(extern.map((k) => k.id));
  const viaAanvrager = new Set(['aanvrager']);
  const stapel = ['aanvrager'];
  while (stapel.length) {
    const id = stapel.pop();
    lijnenExtern.forEach((l) => {
      if (l.van === id && externIds.has(l.naar) && !viaAanvrager.has(l.naar)) { viaAanvrager.add(l.naar); stapel.push(l.naar); }
    });
  }
  const viaEigenLijn = new Set(lijnenExtern.filter((l) => viaAanvrager.has(l.van)).map((l) => l.naar));
  st.hoofden.forEach((h) => {
    if (viaEigenLijn.has(h.id)) return;
    const o = byOnd.get(h.id);
    lijnen.push({ van: 'aanvrager', naar: h.id, pct: o?.rechtsvorm === 'EZ' ? null : h.pct, soort: 'aandelen', auto: true });
  });
  st.links.forEach((l) => lijnen.push({ van: l.ouder, naar: l.kind, pct: l.pct, soort: 'aandelen', extra: !!l.extra }));
  lijnenExtern.forEach((l) => {
    const cert = l.soort === 'certificaten';
    lijnen.push({ van: l.van, naar: l.naar, pct: isIngevuld(l.pct) ? pctUit(l.pct) : null, soort: cert ? 'certificaten' : 'aandelen', extern: true,
      // Bij een STAK die aandelen in meer vennootschappen administreert: van welke vennootschap zijn de certificaten?
      voor: cert && l.voor && ids.has(l.voor) && l.voor !== l.naar && l.voor !== l.van ? l.voor : null });
  });
  // Certificaatklassen: per STAK en vennootschap één klasse (kleur), zowel voor de certificaathouders als voor
  // de lijn van de STAK naar die vennootschap.
  const klassen = [...new Set(lijnen.filter((l) => l.voor).map((l) => `${l.naar}>${l.voor}`))];
  lijnen.forEach((l) => {
    const k = klassen.indexOf(l.voor ? `${l.naar}>${l.voor}` : `${l.van}>${l.naar}`);
    if (k >= 0 && (l.voor || (l.extern && l.soort === 'aandelen'))) l.klasse = k;
  });
  const controles = [];
  onds.forEach((o) => {
    if (o.rechtsvorm === 'EZ') return;
    const inkomend = lijnen.filter((l) => l.naar === o.id && l.pct !== null && l.soort === 'aandelen');
    const som = inkomend.reduce((s, l) => s + l.pct, 0);
    if (som > 1.005) controles.push({ niveau: 'attentie', id: o.id, tekst: `${o.naam || 'Onderneming'}: de belangen tellen op tot ${pctTekst(som)} (meer dan 100%).` });
    else if (som < 0.995 && (metExternIn.has(o.id) || inkomend.length > 1)) {
      controles.push({ niveau: 'info', id: o.id, tekst: `${o.naam || 'Onderneming'}: ${pctTekst(1 - som)} van de aandelen is niet aan een aandeelhouder toegewezen.` });
    }
  });
  // Certificaten per vennootschap in een STAK: samen maximaal 100%.
  const naamVan = (id) => knopen.find((k) => k.id === id)?.naam || '';
  const certSom = new Map();
  lijnen.filter((l) => l.soort === 'certificaten' && l.pct !== null).forEach((l) => {
    const k = `${l.naar}>${l.voor || ''}`;
    certSom.set(k, (certSom.get(k) || 0) + l.pct);
  });
  certSom.forEach((som, k) => {
    const [stak, voor] = k.split('>');
    if (som > 1.005) controles.push({ niveau: 'attentie', id: stak, tekst: `${naamVan(stak)}${voor ? ` (certificaten ${naamVan(voor)})` : ''}: de certificaten tellen op tot ${pctTekst(som)} (meer dan 100%).` });
  });
  extern.filter((k) => k.soort === 'stak').forEach((k) => {
    const gehouden = lijnen.filter((l) => l.van === k.id && l.soort === 'aandelen').length;
    const zonderVoor = lijnen.some((l) => l.naar === k.id && l.soort === 'certificaten' && !l.voor);
    if (gehouden > 1 && zonderVoor) {
      controles.push({ niveau: 'info', id: k.id, tekst: `${k.naam || 'STAK'} administreert aandelen in ${gehouden} vennootschappen: kies bij de certificaathouders van welke vennootschap zij certificaten hebben.` });
    }
  });
  return { knopen, lijnen, controles };
}

/** Organogram als ingesprongen tekst, zoals in de dossiernotities (met de overige aandeelhouders). */
export function organogramTekst(dossier, { titel = '' } = {}) {
  const st = structuur(dossier);
  const graaf = organogramGraaf(dossier);
  const knoop = new Map(graaf.knopen.map((k) => [k.id, k]));
  const byId = new Map((dossier.ondernemingen || []).map((o) => [o.id, o]));
  const regels = titel ? [titel, ''] : [];
  regels.push(naamAanvrager(dossier.aanvrager));
  const herkomst = (id, kind, diepte = 0, pad = new Set()) => {
    // Wie houdt een overige aandeelhouder (bijv. certificaathouders van een STAK)? Bij een STAK alleen de
    // certificaathouders van de vennootschap (kind) waar het hier om gaat.
    const inn = graaf.lijnen.filter((l) => l.naar === id && l.extern && !pad.has(l.van) && !(l.voor && l.voor !== kind));
    if (!inn.length || diepte > 3) return '';
    return ` ← ${inn.map((l) => `${l.pct !== null ? `${pctTekst(l.pct)} ` : ''}${l.soort === 'certificaten' ? 'certificaten ' : ''}${knoop.get(l.van)?.naam || ''}${herkomst(l.van, id, diepte + 1, new Set([...pad, id]))}`).join(', ')}`;
  };
  const beschreven = new Set();
  const tak = (id, diepte, pct, pad) => {
    const o = byId.get(id);
    if (!o) return;
    const isIB = ['EZ'].includes(o.rechtsvorm);
    regels.push(`${'    '.repeat(diepte)}> ${isIB ? '' : `${pctTekst(pct)} `}${o.naam || '(naamloos)'}${o.geconsolideerd ? ' (geconsolideerd)' : ''}`);
    const derden = beschreven.has(id) ? [] : graaf.lijnen.filter((l) => l.naar === id && l.extern);
    beschreven.add(id);
    if (derden.length) {
      regels.push(`${'    '.repeat(diepte + 1)}(overige aandeelhouders: ${derden.map((l) => `${l.pct !== null ? `${pctTekst(l.pct)} ` : ''}${l.soort === 'certificaten' ? 'certificaten ' : ''}${knoop.get(l.van)?.naam || ''}${knoop.get(l.van)?.sub ? ` [${knoop.get(l.van).sub}]` : ''}${herkomst(l.van, id, 0, new Set([id]))}`).join('; ')})`);
    }
    st.kinderen(id).forEach((l) => { if (!pad.has(l.kind)) tak(l.kind, diepte + 1, l.pct, new Set([...pad, l.kind])); });
  };
  st.hoofden.forEach((h) => tak(h.id, 1, h.pct, new Set([h.id])));
  return regels.join('\n');
}

// ---------------------------------------------------------------------------
// Vergelijking berekeningswijzen (zoals berekening 1-1-1 en 1-2-3 in rekensoftware)
// ---------------------------------------------------------------------------
export function vergelijkMethoden(perJaar, T) {
  const w = T.map((y) => num(perJaar[y]));
  const gem = gemiddelde(w);
  const gewogen = (w[0] + 2 * w[1] + 3 * w[2]) / 6;
  return {
    jaren: Object.fromEntries(T.map((y, i) => [y, rond(w[i])])),
    gemiddelde: rond(gem),
    m111: rond(Math.min(gem, w[2])),
    gewogen: rond(gewogen),
    m123: rond(Math.min(gewogen, w[2])),
    fGemiddelde: lijstF(w, 3),
    fGewogen: `(${g(w[0])} + 2 × ${g(w[1])} + 3 × ${g(w[2])}) / 6 =`,
  };
}

// ---------------------------------------------------------------------------
// NHG: inkomen op totaalniveau (alle meegenomen ondernemingen + meegenomen loon/uitkeringen)
// ---------------------------------------------------------------------------
function totaalNHG(dossier, analyses, ctx, trace) {
  const { T, C, vervanging, kader } = ctx;
  const T3 = T[2];
  const ld = dossier.loondienst || {};
  const mee = analyses.filter((a) => a.meenemen);
  const jaren = C ? [...T, C] : [...T];
  const pers = {};
  jaren.forEach((y) => {
    const ib = dossier.ib?.[y] || dossier.ib?.[String(y)] || {};
    const voorStart = ld.voorStartMeenemen === false ? 0 : num(ib.voorStart);
    const naast = ld.meenemen ? num(ib.naast) : 0;
    const uitk = dossier.uitkeringLooptNog ? 0 : num(ib.uitkeringen);
    const row = ld.rowMeenemen === false ? 0 : num(ib.row);
    pers[y] = { voorStart, naast, uitk, row, totaal: voorStart + naast + uitk + row,
      ingevuld: [ib.voorStart, ib.naast, ib.uitkeringen, ib.row].some(isIngevuld) };
  });

  const ondJaar = (y, veld = 'totaal') => mee.reduce((s, a) => s + num(a.jaren[y]?.inkomen[veld]), 0);
  const TOT = {};
  T.forEach((y) => { TOT[y] = rond(ondJaar(y) + pers[y].totaal); });
  let factor = 1;
  let cReal = null;
  let cExtr = null;
  if (C) {
    const met = mee.find((a) => a.jaren[C]?.heeftVW || isIngevuld(a.jaren[C]?.ibOnd?.loon));
    factor = met ? met.jaren[C].factor : 1;
    const persReal = pers[C].ingevuld ? pers[C].totaal : pers[T3].totaal / factor;
    const persExtr = pers[C].ingevuld ? pers[C].totaal * factor : pers[T3].totaal;
    cReal = rond(ondJaar(C) + persReal);
    cExtr = rond(ondJaar(C, 'extr') + persExtr);
  }

  const s = trace.sectie('Berekening gemiddeld box 1 inkomen (totaal)', {
    groep: 'inkomen', kolommen: jaren,
    kolomLabels: Object.fromEntries(jaren.map((y) => [y, y === C ? `${y} (controlejaar)` : String(y)])),
    richtlijn: 'NHG: gemiddelde van de afgelopen 3 jaar met als maximum het laatste jaar; tussentijdse cijfers kunnen het inkomen alleen verlagen.',
  });
  mee.forEach((a) => {
    s.rij(`Box 1 inkomen ${a.naam}`, Object.fromEntries(jaren.map((y) => [y, cel(rond(a.jaren[y]?.inkomen.totaal ?? 0))])));
  });
  const persRij = (label, key) => {
    if (jaren.some((y) => pers[y][key])) s.rij(label, Object.fromEntries(jaren.map((y) => [y, cel(pers[y][key])])));
  };
  persRij('Looninkomsten vóór starten onderneming', 'voorStart');
  persRij('Looninkomen naast ondernemerschap (meegenomen)', 'naast');
  persRij('Inkomensvervangende uitkeringen (niet lopend)', 'uitk');
  persRij('Resultaat uit overige werkzaamheden', 'row');
  const totRij = Object.fromEntries(T.map((y) => [y, cel(TOT[y])]));
  if (C) totRij[C] = cel(cReal, 'gerealiseerd');
  s.rij('Totaal box 1 inkomen per jaar', totRij, { stijl: 'som' });

  const gem = rond(gemiddelde(T.map((y) => TOT[y])));
  const BI = Math.min(gem, TOT[T3]);
  s.rij('Gemiddeld box 1 inkomen in de toetsjaren', { [T3]: cel(gem, lijstF(T.map((y) => TOT[y]), 3)) });
  s.rij('Maximaal het laatste jaar (basis inkomen)', { [T3]: cel(BI, laagsteF([gem, TOT[T3]])) }, { stijl: 'resultaat' });

  let res = BI;
  const stappen = [];
  // Beide routes berekenen zodat de expert de keuze voor vervanging kan onderbouwen.
  let vergelijking = null;
  if (C) {
    const zonder = Math.min(BI, cExtr);
    const Bv = rond((TOT[T[1]] + TOT[T3] + cReal) / 3);
    const lastV = TOT[T3];
    const aV = lastV < Bv && lastV > cReal ? lastV : Bv;
    const s1V = lastV > Bv ? Bv : (cReal < Bv ? cReal : Bv);
    const dV = cExtr < Bv ? cExtr : Bv;
    vergelijking = { zonder, met: Math.min(aV, s1V, dV) };
  }
  if (C && !vervanging) {
    s.rij('Geëxtrapoleerd inkomen lopend jaar (EI)', { [C]: cel(cExtr, `${g(cReal)} × ${String(factor).replace('.', ',')} =`) });
    if (cExtr < BI) {
      res = cExtr;
      stappen.push('Het geëxtrapoleerde inkomen in het lopende jaar is lager dan het basisinkomen: het inkomen wordt naar beneden bijgesteld.');
    } else {
      stappen.push('Het geëxtrapoleerde inkomen in het lopende jaar is niet lager dan het basisinkomen: geen bijstelling (tussentijdse cijfers verhogen het inkomen niet).');
    }
    s.rij('Inkomen na toets lopend jaar', { [C]: cel(res, laagsteF([BI, cExtr])) }, { stijl: 'resultaat' });
  }
  if (vervanging) {
    const T1 = T[0];
    const T2 = T[1];
    const last = TOT[T3];
    const B = rond((TOT[T2] + TOT[T3] + cReal) / 3);
    const aWaarde = last < B && last > cReal ? last : B;
    let s1 = cReal < B ? cReal : B;
    const stap2 = last > B;
    if (stap2) s1 = B;
    const d = cExtr < B ? cExtr : B;
    res = Math.min(aWaarde, s1, d);
    const v = trace.sectie(`Vervanging oudste jaar (${T1}) door gerealiseerd resultaat ${C}`, {
      groep: 'inkomen', kolommen: ['uitkomst'],
      richtlijn: 'NHG: vanaf 1/4 mag het feitelijk behaalde tussentijdse resultaat het oudste jaar vervangen (tussentijdse balans en W&V, OB-aangiften). Extrapolatie is dan niet toegestaan bij het gemiddelde.',
    });
    v.rij(`Gemiddelde zonder vervanging (A): ${T1}, ${T2}, ${T3}`, { uitkomst: cel(gem, lijstF([TOT[T1], TOT[T2], TOT[T3]], 3)) });
    v.rij(`Gemiddelde met vervanging (B): ${T2}, ${T3}, ${C} gerealiseerd`, { uitkomst: cel(B, lijstF([TOT[T2], TOT[T3], cReal], 3)) });
    v.rij(`a) Is ${T3} lager dan B én hoger dan ${C} gerealiseerd?`, { uitkomst: cel(aWaarde, `${g(last)} < ${g(B)} en ${g(last)} > ${g(cReal)}: ${last < B && last > cReal ? 'ja, aftoppen op laatste volledige jaar' : 'nee'}`) });
    v.rij(`b) Stap 1: is ${C} gerealiseerd lager dan B?`, { uitkomst: cel(stap2 ? B : (cReal < B ? cReal : B), `${g(cReal)} < ${g(B)}: ${cReal < B ? 'ja' : 'nee'}`) });
    v.rij(`c) Stap 2: vervalt stap 1 omdat ${T3} hoger is dan B?`, { uitkomst: cel(null, `${g(last)} > ${g(B)}: ${stap2 ? 'ja, stap 1 niet van toepassing' : 'nee'}`, 'tekst') });
    v.rij('d) Stap 3: is het geëxtrapoleerde resultaat lager dan B?', { uitkomst: cel(d, `${g(cExtr)} < ${g(B)}: ${cExtr < B ? 'ja, aftoppen' : 'nee'}`) });
    v.rij('Inkomen na vervanging (laagste van a, b en d)', { uitkomst: cel(res, laagsteF([aWaarde, s1, d])) }, { stijl: 'totaal' });
    stappen.push(`Vervanging toegepast: ${T1} is vervangen door het gerealiseerde resultaat ${C}.`);
  }

  // Loondienst 80%+: maximaal 30%-toets
  const toets30 = dertigProcentToets(ld, kader);
  let box1 = res;
  if (toets30) {
    const persGem = rond(gemiddelde(T.map((y) => pers[y].totaal)));
    const max = persGem + toets30.max;
    s.rij('Maximaal ondernemersinkomen bij loondienst ≥ 80% (A + B)', { [T3]: cel(toets30.max, toets30.f) });
    if (box1 > max) {
      box1 = max;
      stappen.push(`Het ondernemersinkomen is begrensd op ${g(toets30.max)} (loondienstverband ≥ 80%).`);
      s.rij('Box 1 inkomen na begrenzing', { [T3]: cel(box1, `${g(persGem)} + ${g(toets30.max)} =`) }, { stijl: 'resultaat' });
    }
  }
  box1 = Math.max(0, rond(box1));
  const box2 = mee.reduce((sum, a) => sum + num(a.box2?.totaal), 0);
  s.rij('Box 1 inkomen', { [T3]: cel(box1) }, { stijl: 'som' });
  if (mee.some((a) => a.soort === 'VPB')) s.rij('Box 2 inkomen (dividend / overwinst)', { [T3]: cel(box2) });
  s.rij('Totaal berekend inkomen', { [T3]: cel(box1 + box2) }, { stijl: 'totaal' });

  // Situatie 3 (loon gestegen) signaleren
  const meldingen = [];
  if (ld.meenemen) {
    const loon = T.map((y) => num((dossier.ib?.[y] || {}).naast));
    if (loon[2] > loon[1] || loon[2] > loon[0]) {
      meldingen.push({ niveau: 'attentie', tekst: 'Het looninkomen naast de onderneming is gestegen (situatie 3): dit inkomen wordt in principe niet in de inkomensverklaring meegenomen maar met een werkgeversverklaring aangetoond.' });
    }
  }

  return {
    perJaar: TOT, gemiddelde: gem, basis: BI, controleReal: cReal, controleExtr: cExtr, factor, vergelijking,
    box1, box2, berekend: box1 + box2, toetsinkomen: box1 + box2, stappen, toets30, meldingen,
    perOnderneming: mee.map((a) => {
      const w = T.map((y) => rond(a.jaren[y]?.inkomen.totaal ?? 0));
      const gemO = rond(gemiddelde(w));
      return { id: a.id, naam: a.naam, jaren: Object.fromEntries(T.map((y, i) => [y, w[i]])),
        controleReal: C ? rond(a.jaren[C]?.inkomen.totaal ?? 0) : null,
        controleExtr: C ? rond(a.jaren[C]?.inkomen.extr ?? 0) : null,
        gemiddelde: Math.min(gemO, w[2]), box2: num(a.box2?.totaal) };
    }),
    persoonlijk: pers,
  };
}

// ---------------------------------------------------------------------------
// ABN AMRO (BZI-methode): berekend inkomen per hoofdbedrijf = gemiddeld ondernemersinkomen
// (DGA-inkomen of saldo fiscale winst na correcties) + gemiddeld dividend over de meegetelde
// jaren. Daarnaast toetst ZIB de regels uit het Woonbeleid (laagste van gemiddelde en laatste
// jaar, starters 75%/90%, dividendplafond) en het toetskader van de hele structuur.
// ---------------------------------------------------------------------------
function geldstromenVoor(groepIds, hoofdId, analyses, ctx, st) {
  const { T, C } = ctx;
  const jaren = C ? [...T, C] : [...T];
  const byA = new Map(analyses.map((a) => [a.id, a]));
  const uit = [];
  const ids = new Set(groepIds);
  st.links.filter((l) => ids.has(l.kind) && ids.has(l.ouder)).forEach((l) => {
    const kind = byA.get(l.kind);
    const ouder = byA.get(l.ouder);
    if (!kind || !ouder) return;
    // De management fee wordt aan de (primaire) aandeelhouder betaald; het interne dividend
    // naar rato van het belang (bij een gedeelde deelneming ontvangt elke aandeelhouder zijn deel).
    (l.extra ? ['dividend'] : ['fee', 'dividend']).forEach((soort) => {
      const perJaar = {};
      let iets = false;
      jaren.forEach((y) => {
        const totaal = soort === 'fee' ? kind.jaren[y]?.geldstroom.managementFee : kind.jaren[y]?.geldstroom.internDividend;
        const pctY = l.pctJaar ? l.pctJaar(y) : l.pct;
        const betaald = soort === 'dividend' && pctY < 1 ? rond(num(totaal) * pctY) : num(totaal);
        const ontvRaw = soort === 'fee' ? ouder.jaren[y]?.geldstroom.ontvangenFee?.[kind.id] : ouder.jaren[y]?.geldstroom.ontvangenDividend?.[kind.id];
        const ontvangen = isIngevuld(ontvRaw) ? num(ontvRaw) : null;
        if (betaald || ontvangen) iets = true;
        perJaar[y] = { betaald, ontvangen, verschil: ontvangen === null ? null : rond(betaald - ontvangen), totaal: num(totaal) };
      });
      if (iets) uit.push({ van: kind.id, vanNaam: kind.naam, naar: ouder.id, naarNaam: ouder.naam, soort, perJaar, pct: l.pct,
        ...(l.vanaf || l.tot ? { periode: `${l.vanaf ? `vanaf ${l.vanaf}` : ''}${l.vanaf && l.tot ? ' ' : ''}${l.tot ? `t/m ${l.tot}` : ''}` } : {}) });
    });
  });
  const h = byA.get(hoofdId);
  if (h) {
    const perLoon = {};
    const perDiv = {};
    let loonIets = false;
    let divIets = false;
    jaren.forEach((y) => {
      const ibOnd = h.jaren[y]?.ibOnd || {};
      const loon = h.soort === 'VPB' ? num(ibOnd.loon) : num(ibOnd.sfw);
      if (loon) loonIets = true;
      perLoon[y] = { betaald: loon, ontvangen: null, verschil: null };
      const box2 = num(ibOnd.dividend);
      const bg = h.jaren[y]?.geldstroom.dividendDGA;
      const betaalbaar = isIngevuld(bg) ? num(bg) : null;
      if (box2 || betaalbaar) divIets = true;
      perDiv[y] = { betaald: betaalbaar, ontvangen: box2, verschil: betaalbaar === null ? null : rond(betaalbaar - box2) };
    });
    if (loonIets) uit.push({ van: h.id, vanNaam: h.naam, naar: 'dga', naarNaam: 'DGA / ondernemer (privé)', soort: h.soort === 'VPB' ? 'loon' : 'winst', perJaar: perLoon });
    if (divIets) uit.push({ van: h.id, vanNaam: h.naam, naar: 'dga', naarNaam: 'DGA (box 2)', soort: 'dividendDGA', perJaar: perDiv });
  }
  // Overige geldstromen en posities (ook met partijen buiten de berekening): per jaar het bedrag
  // volgens de betaler / schuldeiser en volgens de ontvanger / schuldenaar.
  if (ctx.dossier) {
    const graaf = organogramGraaf(ctx.dossier);
    const naam = (id, tekst) => (id === 'derde' ? (tekst || 'Derde') : graaf.knopen.find((k) => k.id === id)?.naam || tekst || '');
    (ctx.dossier.geldstromenExtra || []).forEach((x, index) => {
      if (!x || !(ids.has(x.van) || ids.has(x.naar))) return;
      const perJaar = {};
      jaren.forEach((y) => {
        const v = x.perJaar?.[y] || x.perJaar?.[String(y)] || {};
        const a = isIngevuld(v.van) ? num(v.van) : null;
        const b = isIngevuld(v.naar) ? num(v.naar) : null;
        perJaar[y] = { betaald: a, ontvangen: b, verschil: a === null || b === null ? null : rond(a - b) };
      });
      uit.push({ van: x.van, vanNaam: naam(x.van, x.vanTekst), naar: x.naar, naarNaam: naam(x.naar, x.naarTekst), soort: x.soort || 'overig',
        perJaar, extra: true, index, toelichting: x.toelichting || '' });
    });
  }
  return uit;
}

export function geldstroomLabel(gs) {
  if (gs.extra) return GELDSTROOM_SOORTEN[gs.soort] || gs.soort;
  return { fee: 'Management fee', dividend: 'Intern dividend', loon: 'Loon DGA', winst: 'Winst (IB)', dividendDGA: 'Betaalbaar gesteld dividend en box 2' }[gs.soort] || gs.soort;
}

/** Alle geldstromen van het dossier: per hoofdbedrijf, zonder dubbele stromen bij gedeelde deelnemingen. */
function alleGeldstromen(analyses, ctx, st) {
  const uit = [];
  const gezien = new Set();
  st.hoofden.forEach((hs) => {
    const groepIds = [...new Set([hs.id, ...hs.afstammelingen.map((x) => x.id)])];
    geldstromenVoor(groepIds, hs.id, analyses, ctx, st).forEach((gs) => {
      const key = `${gs.soort}|${gs.van}|${gs.naar}|${gs.extra ? gs.index : ''}`;
      if (gezien.has(key)) return;
      gezien.add(key);
      uit.push(gs);
    });
  });
  return uit;
}

export const GELDSTROOM_SOORTEN = {
  fee: 'Management fee',
  dividend: 'Dividend',
  rente: 'Rente',
  huur: 'Huur',
  rc: 'Rekening-courant (saldo)',
  lening: 'Lening (saldo)',
  overig: 'Overig',
};

/**
 * Rekenkundige onderbouwing voor een afwijkend inkomen (conclusie "Afwijkend inkomen"): van het
 * berekend inkomen in de rekentool naar het inkomen volgens het Woonbeleid, inclusief eventuele
 * overwinst na de dubbele balanstoets. Jaren van recent naar oud.
 */
function onderbouwingAfwijkend(x) {
  const { h, T, bziInkomen, bziDividend, berekend, wI, beschikbaar, toets, voorAfslag, factor, categorie, prognose, b2, overwinst, overwinstMee, woonbeleidVoorAfslag } = x;
  const isVPB = h.soort === 'VPB';
  const lab = isVPB ? 'DGA-inkomen (na bijtelling)' : 'inkomen (saldo fiscale winst na correcties)';
  const recent = [...T].reverse();
  const regels = [];
  regels.push(`Afwijkend inkomen ${h.naam}: ${eur(woonbeleidVoorAfslag)}`);
  regels.push(`Motivatie: het inkomen is vastgesteld volgens het Woonbeleid${overwinstMee > 0 ? ', inclusief het niet-uitgekeerde dividend (overwinst) na de dubbele balanstoets' : ''}. De rekentool rekent met het gemiddelde${overwinstMee > 0 ? ' en neemt geen niet-uitgekeerd dividend mee' : ''}.`);
  regels.push('Vaststelling:');
  regels.push(`- Berekend inkomen (rekentool): gemiddeld ${lab} ${eur(bziInkomen)}${isVPB ? ` + dividend ${eur(bziDividend)} (gemiddeld dividend, maximaal de gemiddelde nettowinst × belang)` : ''} = ${eur(berekend)}.`);
  regels.push(`- ${isVPB ? 'DGA-inkomen' : 'Inkomen'} per jaar: ${recent.map((y) => `${y} ${eur(rond(h.jaren[y]?.inkomen.totaal ?? 0))}${beschikbaar.includes(y) ? '' : ' (niet meegeteld)'}`).join('; ')}.`);
  if (factor > 0 && factor < 1) {
    regels.push(`- Woonbeleid (${categorie.toLowerCase()}): ${Math.round(factor * 100)}% van het gemiddelde = ${eur(toets)}${prognose !== null ? `, maximaal de prognose ${eur(prognose)}` : ''} (vóór afslag ${eur(voorAfslag)}).`);
  } else if (factor === 1) {
    const last = rond(h.jaren[T[2]]?.inkomen.totaal ?? 0);
    regels.push(`- Woonbeleid: laagste van het gemiddelde (${eur(bziInkomen)}) en het laatste boekjaar (${eur(last)}) = ${eur(Math.min(bziInkomen, last))}.`);
  }
  if (isVPB && b2?.holding) {
    regels.push(`- Holdingroute (3.63): ontvangen dividend uit minderheidsdeelneming(en) ${recent.map((y) => `${y} ${eur(b2.holding.perJaar[y] ?? 0)}`).join('; ')}; laagste van het gemiddelde (${eur(b2.holding.gemiddelde)}) en het laatste jaar = ${eur(b2.holding.bedrag)}. Uitkering en winst van de holding tellen niet mee.`);
  } else if (isVPB && b2) {
    regels.push(`- Uitgekeerd dividend: laagste van het gemiddelde en het laatste jaar, maximaal de gemiddelde nettowinst × belang = ${eur(b2.uitgekeerd)}.`);
    if (overwinst && overwinstMee > 0) {
      const ow = overwinst;
      regels.push(`- Overwinst (${ow.winstLabel.toLowerCase()} -/- uitgekeerd dividend): ${recent.map((y) => `${y} ${eur(ow.ow[y] ?? 0)}`).join('; ')}; laagste van het gemiddelde (${eur(ow.gem)}) en het laatste jaar = ${eur(ow.basis)}.`);
      regels.push(`- Dubbele balanstoets (${ow.omschrijving}): maximaal ${eur(ow.dbt.max)} (solvabiliteit ${eur(ow.dbt.maxSolv ?? 0)}, liquiditeit ${eur(ow.dbt.maxLiq ?? 0)})${ow.owC !== null ? `; controlejaar maximaal ${eur(ow.owC)}` : ''}${ow.vrij !== null ? `; vrij uitkeerbare reserves ${eur(ow.vrij)}` : ''}.`);
      regels.push(`- Overwinst na dubbele balanstoets ${eur(ow.naDbt)} × belang ${pctTekst(ow.aandeel)} = ${eur(ow.bedrag)}.`);
    }
    if (b2.geplafonneerd) regels.push(`- Dividend en overwinst samen zijn begrensd op de gemiddelde nettowinst × belang: ${eur(b2.plafond)}.`);
  }
  const box2 = b2 ? b2.totaal : 0;
  regels.push(`- Totaal: ${eur(voorAfslag)}${box2 ? ` + ${eur(box2)}` : ''} = ${eur(woonbeleidVoorAfslag)}.`);
  regels.push('Bestendigheid: [licht toe waarom dit inkomen bestendig is en de gelden duurzaam onttrokken kunnen worden]');
  regels.push('Documentatie: [jaarrekeningen, IB-aangiften, tussentijdse cijfers, dividendbeleid / notulen]');
  return regels.join('\n');
}

function eur(x) {
  return `€ ${g(x)}`;
}

function totaalABN(dossier, analyses, ctx, trace, st) {
  const { T, C, kader } = ctx;
  const T3 = T[2];
  const onds = dossier.ondernemingen || [];
  const byA = new Map(analyses.map((a) => [a.id, a]));
  const s = trace.sectie('Berekend inkomen per hoofdbedrijf en toets Woonbeleid', {
    groep: 'inkomen', kolommen: ['berekend', 'woonbeleid', 'afgegeven'],
    kolomLabels: { berekend: 'Berekend inkomen (gemiddelde)', woonbeleid: 'Toets Woonbeleid', afgegeven: 'Af te geven' },
    richtlijn: 'Berekend inkomen = gemiddeld DGA-inkomen (of saldo fiscale winst) na correcties + gemiddeld dividend over de meegetelde jaren, het dividend maximaal de gemiddelde nettowinst × belang (een gemiddeld verlies verlaagt het inkomen). Woonbeleid 3.57/3.62: laagste van gemiddelde en laatste boekjaar; starters 75% (1-2 boekjaren) of 90% (2-3 boekjaren), toegepast in het acceptatiesysteem; 3.63: dividend maximaal de gemiddelde nettowinst.',
  });
  const meldingen = [];
  const perHoofd = st.hoofden.map((hs, i) => {
    const h = byA.get(hs.id);
    const ond = onds.find((o) => o.id === hs.id) || {};
    const groepIds = [...new Set([hs.id, ...hs.afstammelingen.filter((x) => !byA.get(x.id)?.geconsolideerd).map((x) => x.id)])];
    const groep = groepIds.map((id) => byA.get(id)).filter(Boolean);
    const toetsStatus = slechtste(groep.map((a) => a.status));
    const voldoet = toetsStatus !== 'niet_akkoord';
    const nietVoldoend = groep.filter((a) => a.status === 'niet_akkoord').map((a) => a.naam);
    const nul = ctx.soort === 'NUL' || !!ond.nulInkomen || ond.meenemen === false;
    const beschikbaar = T.filter((y) => h.jaren[y]?.meegeteld);
    const ink = (y) => h.jaren[y]?.inkomen.totaal ?? 0;
    const dv = (y) => (h.soort === 'VPB' ? num(h.jaren[y]?.ibOnd?.dividend) : 0);
    const wI = beschikbaar.map(ink);
    const wD = beschikbaar.map(dv);
    const wN = beschikbaar.map((y) => (h.soort === 'VPB' ? (h.jaren[y]?.winst.NWcor ?? 0) * (h.jaren[y]?.aandeel ?? h.aandeel) : 0));
    const bziInkomen = rond(wI.length ? gemiddelde(wI) : 0);
    const gemDivBzi = rond(wD.length ? gemiddelde(wD) : 0);
    const gemNwBzi = rond(wN.length ? gemiddelde(wN) : 0);
    // Rekentool: dividend maximaal de gemiddelde nettowinst × belang; een gemiddeld verlies verlaagt het inkomen.
    const bziDividend = h.soort === 'VPB' ? Math.min(gemDivBzi, gemNwBzi) : 0;
    const berekend = bziInkomen + bziDividend;

    // Toets Woonbeleid
    const maanden = h.maandenTotT3;
    let categorie;
    let factor = 1;
    let toetsBasis = 0;
    let formule = '';
    let prognose = null;
    if (maanden < 12) {
      categorie = 'Korter dan 1 boekjaar: geen inkomen';
      factor = 0;
    } else if (maanden < 36) {
      factor = maanden < 24 ? 0.75 : 0.90;
      categorie = maanden < 24 ? 'Tussen 1 en 2 boekjaren: 75%' : 'Tussen 2 en 3 boekjaren: 90%';
      toetsBasis = bziInkomen;
      formule = `${lijstF(wI.map(rond), wI.length)} ${g(bziInkomen)} × ${factor * 100}%`;
      const progEigen = isIngevuld(ond.prognoseBedrag) ? num(ond.prognoseBedrag) : null;
      const progVW = (C ? h.jaren[C]?.vwRuw?.prognose : null) ?? ond.jaren?.[T3 + 1]?.vw?.prognose;
      if (progEigen !== null) prognose = rond(progEigen);
      else if (isIngevuld(progVW)) prognose = rond(num(progVW) * h.aandeel);
    } else {
      const last = rond(ink(T3));
      toetsBasis = Math.min(bziInkomen, last);
      categorie = '3 boekjaren of langer';
      formule = `${lijstF(wI.map(rond), wI.length || 1)} ${g(bziInkomen)}; ${laagsteF([bziInkomen, last])}`;
    }
    let toets = maanden < 12 ? 0 : rond(toetsBasis * factor);
    let voorAfslag = maanden < 12 ? 0 : toetsBasis;
    if (prognose !== null) {
      if (prognose < toets) { toets = prognose; formule += `; prognose ${g(prognose)} is lager`; }
      voorAfslag = Math.min(voorAfslag, prognose);
    }
    const box2 = h.box2 ? h.box2.totaal : 0;
    const woonbeleid = toets + box2;
    const woonbeleidVoorAfslag = voorAfslag + box2;
    const overwinst = h.box2?.overwinst || null;
    const overwinstMee = h.box2?.overwinstMeenemen ? num(h.box2.nietUitgekeerd) : 0;

    // Af te geven inkomen voor dit hoofdbedrijf
    const afw = ond.afwijkend || {};
    let bijdrage = 0;
    let bron = 'berekend';
    if (nul) bron = 'nul';
    else if (afw.actief && isIngevuld(afw.bedrag)) { bijdrage = Math.max(0, rond(num(afw.bedrag))); bron = 'afwijkend'; }
    else if (maanden < 12) bron = 'geen';
    else bijdrage = berekend;

    s.rij(`${h.naam}: ${nul ? '0-inkomen' : categorie}`, {
      berekend: cel(nul ? 0 : berekend, nul ? '' : `${g(bziInkomen)} + ${bziDividend < gemDivBzi ? `dividend ${g(gemDivBzi)}, max. nettowinst × belang ${g(gemNwBzi)}: ${g(bziDividend)}` : `dividend ${g(bziDividend)}`} =`),
      woonbeleid: cel(nul ? 0 : woonbeleid, nul ? '' : `${formule}${box2 ? `; dividend ${g(box2)}` : ''}`),
      afgegeven: cel(bijdrage, bron === 'afwijkend' ? 'afwijkend inkomen' : bron === 'nul' ? '0-inkomen' : bron === 'geen' ? 'geen inkomen' : ''),
    });

    // Meldingen
    if (!nul && !voldoet) {
      meldingen.push({ niveau: 'niet_akkoord', tekst: `${h.naam}: voldoet niet aan het toetskader (${nietVoldoend.join(', ')}). Het berekend inkomen blijft zichtbaar; motiveer een afwijking of geef geen inkomen af.` });
    }
    if (!nul && maanden < 12) {
      meldingen.push({ niveau: 'niet_akkoord', tekst: `${h.naam}: korter dan 1 boekjaar ondernemer, het inkomen mag niet worden meegenomen.` });
    }
    const onderbouwing = nul ? '' : onderbouwingAfwijkend({ h, ond, T, bziInkomen, bziDividend, berekend, wI, beschikbaar, toets, voorAfslag,
      factor, categorie, prognose, b2: h.box2, overwinst, overwinstMee, woonbeleidVoorAfslag });
    if (!nul && maanden >= 12 && woonbeleidVoorAfslag < berekend - 1 && bron === 'berekend') {
      meldingen.push({ niveau: 'attentie', actie: { soort: 'woonbeleid-overnemen', ondId: h.id, bedrag: woonbeleidVoorAfslag },
        tekst: `${h.naam}: volgens het Woonbeleid (laagste van gemiddelde en laatste jaar${box2 < bziDividend ? ', dividendplafond' : ''}${prognose !== null ? ', prognose' : ''}) is het inkomen ${g(woonbeleidVoorAfslag)}, lager dan het berekend inkomen ${g(berekend)}. Overweeg een afwijkend inkomen.` });
    } else if (!nul && maanden >= 12 && overwinstMee > 0 && woonbeleidVoorAfslag > berekend + 1 && bron === 'berekend') {
      meldingen.push({ niveau: 'attentie', actie: { soort: 'woonbeleid-overnemen', ondId: h.id, bedrag: woonbeleidVoorAfslag },
        tekst: `${h.naam}: inclusief de overwinst na de dubbele balanstoets (${g(overwinstMee)}) is het inkomen ${g(woonbeleidVoorAfslag)}. De rekentool van de bank rekent geen niet-uitgekeerd dividend mee: leg dit vast als afwijkend inkomen met de rekenkundige onderbouwing.` });
    }
    if (!nul && h.box2?.overwinstMeenemen && overwinst && !overwinst.toegestaan) {
      meldingen.push({ niveau: 'attentie', tekst: `${h.naam}: de overwinst wordt niet meegenomen; niet voldaan aan: ${overwinst.voorwaarden.filter((c) => c.status !== 'akkoord').map((c) => c.label.toLowerCase()).join(', ')}.` });
    }
    if (!nul && h.box2?.overwinstMeenemen && overwinst?.toegestaan && overwinst.naDbt < overwinst.basis) {
      meldingen.push({ niveau: 'info', tekst: `${h.naam}: de dubbele balanstoets verlaagt de overwinst van ${g(overwinst.basis)} naar ${g(overwinst.naDbt)}${overwinst.benodigd ? ` (balansversterking nodig voor het volledige bedrag: ${g(overwinst.benodigd)})` : ''}.` });
    }
    if (!nul && factor > 0 && factor < 1) {
      meldingen.push({ niveau: 'info', tekst: `${h.naam}: starter (${categorie.toLowerCase()}). Het acceptatiesysteem past de afslag toe op het berekend inkomen (toetsinkomen ${g(toets)}); geef het berekend inkomen zonder afslag af. Bij een afwijkend inkomen pas je de afslag zelf toe.` });
      if (prognose === null) meldingen.push({ niveau: 'attentie', tekst: `${h.naam}: vraag een prognose op (RA/AA); het toetsinkomen is het laagste van ${factor * 100}% van het gemiddelde en de prognose.` });
      else if (!ond.prognoseRAAA) meldingen.push({ niveau: 'attentie', tekst: `${h.naam}: de prognose is niet door een RA/AA opgesteld. Motiveer waarom de opsteller een terzake deskundige is.` });
    }
    if (bron === 'afwijkend' && !String(afw.motivatie || '').trim()) {
      meldingen.push({ niveau: 'attentie', tekst: `${h.naam}: leg de motivatie en de rekenkundige onderbouwing van het afwijkende inkomen vast.` });
    }
    if (C && !nul && h.jaren[C]?.heeftVW && h.jaren[C].inkomen.extr < bziInkomen) {
      meldingen.push({ niveau: 'attentie', tekst: `${h.naam}: het geëxtrapoleerde inkomen ${C} (${g(rond(h.jaren[C].inkomen.extr))}) ligt onder het gemiddelde (${g(bziInkomen)}). Beoordeel de bestendigheid en motiveer.` });
    }
    groep.forEach((a) => {
      const ntv = a.jaren[T3]?.geldstroom.nogTeOntvangenDividend;
      if (ntv > 0) meldingen.push({ niveau: 'attentie', tekst: `${a.naam}: ${g(ntv)} dividend nog te ontvangen per ultimo ${T3} (overlopende activa). Het dividend is (nog) niet in liquide middelen ontvangen; beoordeel de kasstroom.` });
    });

    const geldstromen = geldstromenVoor(groepIds, hs.id, analyses, ctx, st);

    return {
      id: h.id, naam: h.naam, soort: h.soort, rechtsvormKort: h.rechtsvormKort, index: i,
      groep: groepIds, afstammelingen: hs.afstammelingen, voldoet, toetsStatus, nietVoldoend, nul,
      bziInkomen, bziDividend, gemDivBzi, gemNwBzi, berekend,
      perJaar: Object.fromEntries((C ? [...T, C] : T).map((y) => [y, { inkomen: rond(ink(y)), dividend: dv(y), meegeteld: T.includes(y) && !!h.jaren[y]?.meegeteld }])),
      maanden, categorie, factor, prognose, toets, box2, woonbeleid, woonbeleidVoorAfslag,
      uitgekeerdDividend: num(h.box2?.uitgekeerd), overwinst, overwinstMee, onderbouwing,
      bijdrage, bron, afwijkend: afw, geldstromen,
      // velden voor bestaande overzichten
      jaren: Object.fromEntries(T.map((y) => [y, rond(ink(y))])),
      controleExtr: C ? rond(h.jaren[C]?.inkomen.extr ?? 0) : null,
      gemiddelde: bziInkomen, prognoseRAAA: ond.prognoseRAAA === true,
    };
  });

  // Resultaat uit overige werkzaamheden (3.69)
  const rows = T.map((y) => num((dossier.ib?.[y] || {}).row));
  let row = 0;
  if (ctx.soort !== 'NUL' && rows.some((x) => x !== 0)) {
    const gem = rond(gemiddelde(rows));
    row = Math.max(0, Math.min(gem, rows[2]));
    s.rij('Resultaat uit overige werkzaamheden (3.69)', { berekend: cel(row, `${lijstF(rows, 3)} ${g(gem)}; ${laagsteF([gem, rows[2]])}`), woonbeleid: cel(row), afgegeven: cel(row) });
  }
  const actief = perHoofd.filter((x) => !x.nul);
  const berekend = actief.reduce((x, o) => x + o.berekend, 0) + row;
  const toetsinkomen = actief.reduce((x, o) => x + o.woonbeleid, 0) + row;
  const woonbeleidVoorAfslag = actief.reduce((x, o) => x + o.woonbeleidVoorAfslag, 0) + row;
  const vastgesteld = perHoofd.reduce((x, o) => x + o.bijdrage, 0) + row;
  s.rij('Totaal', { berekend: cel(berekend), woonbeleid: cel(toetsinkomen), afgegeven: cel(vastgesteld) }, { stijl: 'totaal' });

  const perJaarTotaal = Object.fromEntries(T.map((y) => [y, actief.reduce((x, o) => x + o.perJaar[y].inkomen + o.perJaar[y].dividend, 0)]));
  return {
    berekend, toetsinkomen, woonbeleidVoorAfslag, vastgesteld, row,
    box2: actief.reduce((x, o) => x + o.bziDividend, 0),
    box1: actief.reduce((x, o) => x + o.bziInkomen, 0) + row,
    perHoofdbedrijf: perHoofd, perOnderneming: perHoofd, perJaar: perJaarTotaal,
    meldingen, stappen: [],
  };
}

// ---------------------------------------------------------------------------
// Hoofdfunctie
// ---------------------------------------------------------------------------
export function bereken(dossier, opties = {}) {
  const { kader, datum, jaarNu, T, T3, C } = bepaalJaren(dossier);
  const inst = dossier.instellingen || {};
  const soort = dossier.soort === 'NUL' ? 'NUL' : 'IKV';
  const vervanging = !!kader.vervangenVanaf && kader.familie === 'NHG' && soort === 'IKV' && !!inst.vervangOudsteJaar && !!C;
  const rc = berekenRC(dossier.rc);
  const leningDirectie = berekenLeningDirectie(dossier.leningDirectie);
  const onds = dossier.ondernemingen || [];
  const st = structuur(dossier);
  // Welke ondernemingen tellen voor het inkomen mee? Een hoofdbedrijf met 0-inkomen (beoordelingsverklaring)
  // telt met zijn deelnemingen alleen mee in de risicobeoordeling, tenzij een deelneming ook onder een
  // meegenomen hoofdbedrijf valt (gedeelde deelneming). Bij de totaalkaders kan dat ook per onderneming.
  const nietMeeIds = new Set();
  const meeIds = new Set();
  st.hoofden.forEach((h) => {
    const o = onds.find((x) => x.id === h.id) || {};
    const ids = [h.id, ...h.afstammelingen.map((x) => x.id)];
    if (o.nulInkomen || o.meenemen === false) ids.forEach((id) => nietMeeIds.add(id));
    else ids.forEach((id) => meeIds.add(id));
  });
  meeIds.forEach((id) => nietMeeIds.delete(id));
  if (kader.familie !== 'ABN') onds.forEach((o) => { if (o.nulInkomen || o.meenemen === false) nietMeeIds.add(o.id); });
  const bel = belangen(dossier, st, { telt: (id) => !nietMeeIds.has(id), jaar: T3 });
  const ctx = { kader, kaderId: kader.id, familie: kader.familie, soort, datum, jaarNu, T, C, vervanging,
    ib: dossier.ib || {}, instellingen: inst, rc, dossier, belangVan: (id, y) => bel.get(id)?.belangJaar(y) ?? null };
  const meldingen = [];
  const trace = new Trace();

  const analyses = onds.map((o) => analyseerOnderneming(o, ctx));
  const byA = new Map(analyses.map((a) => [a.id, a]));

  // Economisch belang en zeggenschap via de keten (een 100%-dochter van een minderheidsbelang geeft geen zeggenschap).
  analyses.forEach((a) => {
    const b = bel.get(a.id);
    if (!b) return;
    a.belangEconomisch = b.belangJaar(T3);
    if (a.isDeelneming) a.zeggenschap = b.keten;
    if (a.soort === 'VPB' && !a.zeggenschap && !a.maxOnttrekkenNvt) {
      a.maxOnttrekkenNvt = `Geen zeggenschap via de structuur (economisch belang ${p(a.belangEconomisch)}): onttrekken kan alleen via een dividendbesluit van de aandeelhouders.`;
    }
  });

  // Indirect belang van deelnemingen (op structuurniveau, in het laatste toetsjaar)
  st.hoofden.forEach((h) => {
    h.afstammelingen.forEach((x) => {
      const a = byA.get(x.id);
      if (!a || a.checks.some((c) => c.key === 'belang')) return;
      const ind = x.indirectJaar ? x.indirectJaar(T3) : x.indirect;
      const minB = kader.familie === 'ABN' ? kader.dgaMinBelang : (kader.minBelang ?? 0.05);
      const ok = ind >= minB;
      a.checks.push({ key: 'belang', label: 'Belang (indirect)', status: ok ? 'akkoord' : 'attentie',
        tekst: `Indirect belang ${p(ind)} via ${byA.get(x.via)?.naam || 'de aandeelhouder'}${ok ? '' : kader.familie === 'ABN' ? ' (< 20%): alleen relevant voor de risicobeoordeling en geldstromen' : ` (< ${p(minB)})`}.` });
      a.status = slechtste(a.checks.map((c) => c.status));
    });
  });

  if (kader.familie !== 'ABN') analyses.forEach((a) => { if (nietMeeIds.has(a.id)) a.meenemen = false; });

  // Ontvangen dividend uit minderheidsdeelnemingen (holdingroute ABN 3.63)
  const ontvangenMinderheid = (hoofdId) => {
    const h = byA.get(hoofdId);
    const uit = {};
    (C ? [...T, C] : T).forEach((y) => {
      let somY = 0;
      st.links.filter((l) => l.ouder === hoofdId).forEach((l) => {
        const pctY = l.pctJaar(y);
        if (pctY <= 0 || pctY > 0.5) return;
        const kind = byA.get(l.kind);
        if (!kind) return;
        const raw = h?.jaren[y]?.geldstroom.ontvangenDividend?.[l.kind];
        somY += isIngevuld(raw) ? num(raw) : num(kind.jaren[y]?.geldstroom.internDividend) * pctY;
      });
      uit[y] = rond(somY);
    });
    return uit;
  };

  if (soort === 'IKV') {
    analyses.forEach((a, i) => {
      if (a.soort !== 'VPB' || nietMeeIds.has(a.id)) return;
      const model = kader.box2?.model;
      if (model === 'NHG' && a.meenemen) a.box2 = box2NHG(a, onds[i], ctx);
      else if (model === 'ABN' && !a.parentId) a.box2 = box2ABN(a, onds[i], ctx, { ontvangenMinderheid: ontvangenMinderheid(a.id) });
      else if (model === 'ASN' && a.meenemen && !a.isDeelneming) a.box2 = box2ASN(a, onds[i], ctx);
      else if (model === 'OPT' && a.meenemen) {
        const b = bel.get(a.id);
        // Ontvangen dividend van deelnemingen in jaar y (geldstromen, anders het uitgekeerde interne dividend naar belang).
        const ontvangenDividend = (y) => st.links.filter((l) => l.ouder === a.id).reduce((som, l) => {
          const kind = byA.get(l.kind);
          const raw = a.jaren[y]?.geldstroom.ontvangenDividend?.[l.kind];
          return som + (isIngevuld(raw) ? num(raw) : num(kind?.jaren[y]?.geldstroom.internDividend) * l.pctJaar(y));
        }, 0);
        if (b?.keten) a.box2 = box2OPT(a, onds[i], ctx, { belangJaar: b.belangInkomenJaar, keten: true, ontvangenDividend });
      }
    });
  }

  // Optimaal: dividend uit minderheidsbelangen (geen zeggenschap), alleen met trackrecord en per jaar maximaal de winst.
  if (soort === 'IKV' && kader.box2?.model === 'OPT') {
    ctx.minderheid = [];
    analyses.forEach((a) => {
      if (a.soort !== 'VPB' || nietMeeIds.has(a.id)) return;
      const b = bel.get(a.id);
      if (!b || b.keten) return;
      const perJaar = {};
      let relevant = !a.isDeelneming;
      T.forEach((y) => {
        let somY = 0;
        if (!a.isDeelneming) somY = num(a.jaren[y]?.ibOnd?.dividend);
        else {
          st.links.filter((l) => l.kind === a.id).forEach((l) => {
            const bo = bel.get(l.ouder);
            const ouder = byA.get(l.ouder);
            if (!ouder || !bo?.keten || nietMeeIds.has(l.ouder)) return;
            relevant = true;
            const raw = ouder.jaren[y]?.geldstroom.ontvangenDividend?.[a.id];
            const ontv = isIngevuld(raw) ? num(raw) : num(a.jaren[y]?.geldstroom.internDividend) * l.pctJaar(y);
            somY += ontv * bo.belangInkomenJaar(y);
          });
        }
        const cap = Math.max(0, a.jaren[y]?.winst.NWcor ?? 0) * b.belangInkomenJaar(y);
        perJaar[y] = rond(Math.max(0, Math.min(somY, cap)));
      });
      if (!relevant) return;
      const n = Math.min(T.length, Math.max(1, kader.minderheidsdividend?.trackrecordJaren ?? 3));
      const trackrecord = T.slice(-n).every((y) => perJaar[y] > 0);
      const nok = a.status === 'niet_akkoord';
      ctx.minderheid.push({ id: a.id, naam: a.naam, perJaar, trackrecord, nok, meetellen: trackrecord && !nok,
        gemiddelde: rond(gemiddelde(T.map((y) => perJaar[y]))) });
      if (nok && T.some((y) => perJaar[y] > 0)) meldingen.push({ niveau: 'attentie', tekst: `${a.naam}: minderheidsbelang voldoet niet aan de normen; het dividend telt in Optimaal niet als bestendig inkomen.` });
      else if (!trackrecord && T.some((y) => perJaar[y] > 0)) meldingen.push({ niveau: 'attentie', tekst: `${a.naam}: dividend uit een minderheidsbelang telt in Optimaal pas mee met een trackrecord van ${n} jaar (per jaar maximaal de winst van de deelneming).` });
    });
  }

  // Knab: het totaalinkomen mag maximaal 20% boven het NHG-inkomen liggen (B.1.1.0).
  if (soort === 'IKV' && kader.methode123?.maxBovenNHG !== null && kader.methode123?.maxBovenNHG !== undefined && !opties.zonderReferentie) {
    try {
      ctx.nhgReferentie = bereken({ ...dossier, kader: 'NHG', afwijkend: undefined }, { zonderReferentie: true }).toetsinkomen;
    } catch {
      ctx.nhgReferentie = null;
    }
  }

  // Toetsjaren (algemeen)
  const tj = trace.sectie('Toetsjaren en controlejaar', { groep: 'algemeen', kolommen: ['waarde'] });
  tj.rij('Berekeningsdatum', { waarde: cel(P.toISO(P.parseISO(datum)).split('-').reverse().join('-'), '', 'tekst') });
  tj.rij('Definitieve cijfers vorig boekjaar verplicht vanaf', { waarde: cel(`${String(kader.definitiefVerplichtVanaf.d).padStart(2, '0')}-${String(kader.definitiefVerplichtVanaf.m).padStart(2, '0')}-${jaarNu}`, '', 'tekst') });
  tj.rij('Toetsjaren (TJr-3, TJr-2, TJr-1)', { waarde: cel(T.join(', '), '', 'tekst') });
  tj.rij('Controlejaar', { waarde: cel(C ? String(C) : 'Geen controlejaar', '', 'tekst') });
  const cAn = C ? analyses.find((a) => a.jaren[C]?.heeftVW) : null;
  if (cAn) {
    const j = cAn.jaren[C];
    tj.rij('Cijfers controlejaar over periode', { waarde: cel(`${j.van.split('-').reverse().join('-')} t/m ${j.tot.split('-').reverse().join('-')}`, '', 'tekst') });
    tj.rij('Extrapolatiefactor', { waarde: cel(`360 / ${P.days360(j.van, j.tot)} = ${String(j.factor).replace('.', ',')}`, '', 'tekst') });
  }
  if (kader.vervangenVanaf && kader.familie === 'NHG') tj.rij(`Vervangen resultaat oudste jaar (${T[0]}) door gerealiseerd resultaat controlejaar`, { waarde: cel(vervanging ? 'Ja' : 'Nee', '', 'tekst') });
  tj.rij('Toetskader', { waarde: cel(`${kader.naam}, ${kader.versie}`, '', 'tekst') });
  if (kader.aangepast) tj.rij('Aangepaste parameters', { waarde: cel(Object.entries(kader.aangepast).map(([k, v]) => `${k} = ${String(v).replace('.', ',')}`).join('; '), '', 'tekst') });

  // Meldingen op dossierniveau
  if (!onds.length) meldingen.push({ niveau: 'niet_akkoord', tekst: 'Voeg minimaal één onderneming toe.' });
  if (vervanging && !P.opOfNa(datum, kader.vervangenVanaf.m, kader.vervangenVanaf.d)) {
    meldingen.push({ niveau: 'niet_akkoord', tekst: `Vervanging van het oudste jaar is pas mogelijk vanaf ${kader.vervangenVanaf.d}-${kader.vervangenVanaf.m}.` });
  }
  if (inst.vervangOudsteJaar && soort === 'IKV' && !kader.vervangenVanaf) {
    meldingen.push({ niveau: 'info', tekst: `${kader.kort} kent geen vervanging van het oudste jaar; het lopende jaar telt volgens de regels van het kader.` });
  }
  if (vervanging && analyses.some((a) => a.meenemen && a.jaren[C] && !a.jaren[C].heeftBalans)) {
    meldingen.push({ niveau: 'attentie', tekst: 'Vervanging vereist een tussentijdse balans (geen kolommenbalans) naast de winst- en verliesrekening.' });
  }
  // ASN §3.3: maximaal drie entiteiten (geconsolideerd telt als één) en maximaal twee minderheidsdeelnemingen.
  if (soort === 'IKV' && kader.maxEntiteiten) {
    const entiteiten = analyses.filter((a) => !nietMeeIds.has(a.id) && !a.geconsolideerd).length;
    const minderheden = st.links.filter((l) => !nietMeeIds.has(l.kind) && l.pctJaar(T3) > 0 && l.pctJaar(T3) < 1).length;
    if (minderheden > (kader.maxMinderheidsdeelnemingen ?? 99)) {
      meldingen.push({ niveau: dossier.bestaandeRelatie ? 'attentie' : 'niet_akkoord', tekst: `${kader.kort}: ${minderheden} minderheidsdeelnemingen (geen 100% belang); bij meer dan ${kader.maxMinderheidsdeelnemingen} wordt geen inkomen uit onderneming vastgesteld${dossier.bestaandeRelatie ? ' (bestaande relatie: uitzondering mogelijk)' : ''}.` });
    }
    if (entiteiten > kader.maxEntiteiten) {
      meldingen.push({ niveau: dossier.bestaandeRelatie ? 'attentie' : 'niet_akkoord', tekst: `${kader.kort}: ${entiteiten} entiteiten uitgewerkt; maximaal ${kader.maxEntiteiten} (geconsolideerde cijfers tellen als één). Vraag een geconsolideerde jaarrekening of consolidatiestaat op.` });
    }
  }
  analyses.forEach((a) => (a.signalen || []).forEach((m) => meldingen.push(m)));
  // Een (nieuwe) onderneming zonder eigen inkomen die op de duur afketst, zet bij de totaalkaders het hele
  // inkomen op € 0. Stel dan een 0-inkomen (beoordelingsverklaring) voor die onderneming voor.
  if (soort === 'IKV' && kader.familie !== 'ABN') {
    analyses.filter((a) => a.meenemen && a.checks.some((c) => c.key === 'duur' && c.status === 'niet_akkoord')).forEach((a) => {
      const zonderInkomen = T.every((y) => !rond(a.jaren[y]?.inkomen.totaal ?? 0) && !num(a.jaren[y]?.ibOnd?.dividend));
      if (zonderInkomen && analyses.length > 1) {
        meldingen.push({ niveau: 'attentie', tekst: `${a.naam} bestaat korter dan ${kader.minMaandenKvK} maanden en levert geen eigen inkomen. Zonder 0-inkomen (beoordelingsverklaring) voldoet het dossier niet aan het toetskader; zet bij de onderneming "0-inkomen / beoordelingsverklaring" aan als het inkomen niet uit deze onderneming komt.` });
      }
    });
  }
  if (rc.maandlast > 0) {
    meldingen.push({ niveau: 'info', tekst: `Maandlast rekening-courant directie: ${rc.tekst} Neem deze mee als financiële verplichting in privé.` });
  }
  if (leningDirectie.maandlast > 0) {
    meldingen.push({ niveau: 'info', tekst: `Lening directie (BV aan DGA): ${leningDirectie.tekst} Neem de maandlast mee als financiële verplichting in privé.` });
  }
  const zk = zkLijst(dossier);
  const zkPrive = zk.filter((x) => x.status !== 'afgelost' && x.gedragenDoor === 'prive');
  if (zkPrive.length) {
    meldingen.push({ niveau: 'info', tekst: `Zakelijk krediet met lasten in privé: ${zkPrive.map((x) => `${x.kredietgever || 'krediet'} ${g(num(x.maandlast))} per maand`).join(', ')}. Neem mee als financiële verplichting.` });
  }
  if (dossier.uitkeringLooptNog && T.some((y) => num((dossier.ib?.[y] || {}).uitkeringen) > 0)) {
    meldingen.push({ niveau: 'info', tekst: 'Er loopt nog een inkomensvervangende uitkering: deze is niet meegenomen en ter beoordeling aan de geldverstrekker.' });
  }
  analyses.forEach((a) => {
    const j = a.jaren[T3];
    if (!nietMeeIds.has(a.id) && soort === 'IKV' && j && !j.heeftVW && !isIngevuld(j.ibOnd?.sfw) && !isIngevuld(j.ibOnd?.loon)) {
      meldingen.push({ niveau: 'attentie', tekst: `${a.naam}: er zijn nog geen cijfers over ${T3} ingevoerd.` });
    }
  });

  // Inkomen
  let inkomen = null;
  let nul = null;
  if (soort === 'IKV') {
    const totaalFn = { NHG: totaalNHG, ABN: totaalABN, ASN: totaalASN, KNAB: totaalKNAB, OPT: totaalOPT }[kader.totaal] || totaalNHG;
    inkomen = totaalFn(dossier, analyses, ctx, trace, st);
    meldingen.push(...inkomen.meldingen);
    // Niet-meegenomen ondernemingen (0-inkomen): risicobeoordeling en verrekening van een ongedekt verlies
    const nietMee = analyses.filter((a) => nietMeeIds.has(a.id));
    if (nietMee.length) {
      const deel = beoordeelNul({ ...dossier, ondernemingen: onds.filter((o) => nietMeeIds.has(o.id)) }, nietMee, ctx);
      inkomen.nietMeegenomen = deel;
      const verrekening = deel.maandlastCorrectie * 12;
      if (verrekening > 0 && nietMee.length < analyses.length) {
        inkomen.verrekening = verrekening;
        inkomen.toetsinkomen = Math.max(0, inkomen.toetsinkomen - verrekening);
        if (inkomen.vastgesteld !== undefined) inkomen.vastgesteld = Math.max(0, inkomen.vastgesteld - verrekening);
        meldingen.push({ niveau: 'attentie', tekst: `Ongedekt verlies in een niet-meegenomen onderneming (${g(verrekening)} per jaar) is verrekend met het inkomen.` });
      }
      if (deel.status === 'niet_akkoord') meldingen.push({ niveau: 'niet_akkoord', tekst: 'Een onderneming met 0-inkomen vormt een risico (zie beoordeling).' });
    }
    inkomen.methoden = vergelijkMethoden(inkomen.perJaar || {}, T);
    // Geldstromen binnen de structuur (en met partijen daarbuiten), één keer per stroom
    inkomen.geldstromen = alleGeldstromen(analyses, ctx, st);
    inkomen.geldstromen.forEach((gs) => {
      const verschil = (C ? [...T, C] : T).filter((y) => gs.perJaar[y]?.verschil && Math.abs(gs.perJaar[y].verschil) > 1);
      if (verschil.length) {
        meldingen.push({ niveau: 'attentie', tekst: `${geldstroomLabel(gs)} ${gs.vanNaam} → ${gs.naarNaam} sluit niet aan in ${verschil.join(', ')} (verschil ${verschil.map((y) => g(gs.perJaar[y].verschil)).join(' / ')}). Licht het verschil toe.` });
      }
    });
  } else {
    nul = beoordeelNul(dossier, analyses, ctx);
  }

  // Status
  let status;
  if (soort === 'NUL') {
    status = slechtste([nul.status, ...meldingen.filter((m) => m.niveau !== 'info').map((m) => m.niveau)]);
  } else {
    const zonderZeggenschap = (a) => kader.box2?.model === 'OPT' && bel.get(a.id) && !bel.get(a.id).keten;
    const checks = analyses.filter((a) => !nietMeeIds.has(a.id))
      .flatMap((a) => a.checks.map((c) => (zonderZeggenschap(a) && c.status === 'niet_akkoord' ? 'attentie' : c.status)));
    status = slechtste([...checks, ...meldingen.filter((m) => m.niveau !== 'info').map((m) => m.niveau)]);
  }

  // Vastgesteld inkomen
  const afw = dossier.afwijkend || {};
  let vastgesteld = 0;
  let bron = 'berekend';
  if (soort === 'NUL') {
    bron = 'nul';
  } else if (afw.actief && isIngevuld(afw.bedrag)) {
    vastgesteld = Math.max(0, rond(num(afw.bedrag)));
    bron = 'afwijkend';
  } else if (kader.familie === 'ABN') {
    // De rekentool van de bank toont het berekend inkomen ook als het toetskader niet wordt gehaald;
    // de acceptant beslist (afwijkend inkomen, geen inkomen of 0-inkomen).
    const ph = inkomen.perHoofdbedrijf;
    vastgesteld = Math.max(0, rond(inkomen.vastgesteld));
    if (ph.length && ph.every((x) => x.nul)) bron = 'nul';
    else if (ph.some((x) => x.bron === 'afwijkend')) bron = 'afwijkend';
    else if (vastgesteld === 0 && ph.some((x) => x.bron === 'geen')) bron = 'geen';
  } else if (status === 'niet_akkoord') {
    vastgesteld = 0;
    bron = 'geen';
  } else {
    vastgesteld = Math.max(0, rond(inkomen.toetsinkomen));
  }

  const heeftVPB = analyses.some((a) => a.soort === 'VPB');
  const docs = documentenlijst(dossier, {
    kader: kader.id, familie: kader.familie, kaderCfg: kader, T, C, heeftVPB,
    heeftSamenwerking: onds.some((o) => ['VOF', 'MTS', 'CV'].includes(o.rechtsvorm)),
    sbi45: analyses.some((a) => a.sbi45),
    meerdereBV: analyses.filter((a) => a.soort === 'VPB').length > 1,
    stilleReserves: onds.some((o) => Object.values(o.jaren || {}).some((j) => num(j?.div?.stilleReserves) > 0)),
    box3: onds.some((o) => Object.values(o.jaren || {}).some((j) => num(j?.div?.box3Ingezet) > kader.box3ZonderBewijs)),
    vervanging,
    belet: !!inst.belet?.actief,
    tussentijdsVerplicht: !!kader.tussentijdsVerplichtVanaf && P.opOfNa(datum, kader.tussentijdsVerplichtVanaf.m, kader.tussentijdsVerplichtVanaf.d) && T3 === jaarNu - 1,
    starter: inkomen?.perOnderneming?.some((o) => o.factor && o.factor < 1) || !!inkomen?.starter,
    beroepsregister: onds.some((o) => ['medisch_juridisch', 'fysiotherapeut'].includes(o.beroepsgroep)),
    rc: num(dossier.rc?.saldo) > 0 || analyses.some((a) => num(a.jaren[T3]?.balans?.vordDGAKort) > 0),
    leningDirectie: num(dossier.leningDirectie?.hoofdsom) > 0 || analyses.some((a) => num(a.jaren[T3]?.balans?.fvaDGA) > 0),
    zk: zk.length > 0,
    dividend: heeftVPB && T.some((y) => onds.some((o) => num(dossier.ib?.[y]?.perOnd?.[o.id]?.dividend) > 0)),
    deelnemingen: st.links.length > 0,
    accountantsverklaring: analyses.filter((a) => a.soort === 'VPB').length >= 3,
    dividendbeleid: heeftVPB && soort === 'IKV' && (!!inst.abnDividend?.nietUitgekeerd
      || (kader.familie === 'ABN' && onds.some((o) => o.overwinst?.meenemen === true || o.holdingroute === true))
      || analyses.some((a) => a.soort === 'VPB' && a.aandeel < 1 && T.some((y) => num(a.jaren[y]?.ibOnd?.dividend) > 0 || num(a.jaren[y]?.geldstroom?.internDividend) > 0))),
  });

  return {
    kader: kader.id,
    familie: kader.familie,
    kaderNaam: kader.naam,
    kaderVersie: kader.versie,
    kaderCfg: kader,
    soort,
    datum,
    jaarNu,
    geldigTot: P.geldigTot(datum, kader.geldigheidMaanden),
    T, T3, C, vervanging,
    ondernemingen: analyses,
    structuur: st,
    inkomen,
    nul,
    rc,
    leningDirectie,
    zk,
    toets30: kader.dertigProcentRegel ? dertigProcentToets(dossier.loondienst, kader) : null,
    status,
    meldingen,
    vastgesteld,
    bron,
    berekend: inkomen ? inkomen.berekend : 0,
    toetsinkomen: inkomen ? inkomen.toetsinkomen : 0,
    documenten: docs,
    trace,
  };
}

/**
 * Hetzelfde dossier volgens alle kaders naast elkaar (zonder handmatig afwijkend inkomen), met per kader de
 * uitkomst, het oordeel en de belangrijkste redenen.
 */
export function vergelijkKaders(dossier, ids = KADER_VOLGORDE) {
  const basis = {
    ...dossier,
    afwijkend: undefined,
    ondernemingen: (dossier.ondernemingen || []).map((o) => ({ ...o, afwijkend: undefined })),
  };
  return ids.map((id) => {
    try {
      const r = bereken({ ...basis, kader: id });
      const nok = [
        ...r.meldingen.filter((m) => m.niveau === 'niet_akkoord').map((m) => m.tekst),
        ...r.ondernemingen.filter((a) => a.meenemen !== false || r.familie === 'ABN')
          .flatMap((a) => a.checks.filter((c) => c.status === 'niet_akkoord').map((c) => `${a.naam}: ${c.label}`)),
      ];
      return {
        id, kort: r.kaderCfg.kort, naam: r.kaderNaam, versie: r.kaderVersie, nhg: r.kaderCfg.nhg,
        status: r.status, bron: r.bron, berekend: r.berekend, toetsinkomen: r.toetsinkomen, vastgesteld: r.vastgesteld,
        box1: r.inkomen?.box1 ?? null, box2: r.inkomen?.box2 ?? null, stappen: r.inkomen?.stappen || [], nok: [...new Set(nok)].slice(0, 6),
        attenties: r.meldingen.filter((m) => m.niveau === 'attentie').length, T: r.T, C: r.C, starter: r.inkomen?.starter || null,
      };
    } catch (e) {
      return { id, kort: KADERS[id]?.kort || id, fout: String(e?.message || e) };
    }
  });
}
