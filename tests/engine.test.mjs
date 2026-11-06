// Rekenkern-tests. Uitvoeren met: npm test  (of: node --test)
// De verwachte uitkomsten komen uit de voorbeelden in het NHG-toetskader (bijlage I en II),
// uit de rekenvoorbeelden van een uitgebreide rapportage en uit zelf samengestelde, fictieve
// casussen voor de BZI-methode (ABN AMRO). Er zitten geen klantgegevens in deze tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bereken, dertigProcentToets, berekenRC, annuiteit, berekenLeningDirectie, salarisPeriode, structuur,
  organogramTekst, organogramGraaf, vergelijkMethoden,
} from '../public/js/engine/index.js';
import { bandbreedte, naOnttrekking } from '../public/js/engine/onderneming.js';
import { zkLijst } from '../public/js/engine/nul.js';
import { KADERS } from '../public/js/engine/kaders.js';
import * as P from '../public/js/engine/periods.js';
import { parseBedrag } from '../public/js/util.js';
import { migreerDossier, detailSom, pasDetailToe, weergaveVan } from '../public/js/schema/fields.js';
import { verdeelGrootboek, parseGrootboekTekst, postVoorRekening } from '../public/js/schema/rekeningschema.js';
import { getekend, VERMOGENS_CORRECTIES, WINST_CORRECTIES } from '../public/js/schema/correcties.js';

function ezDossier({ kader = 'NHG', datum = '2026-07-15', T3 = 2025, sfw, ytd, van, tot, vervang = false,
  start = '2010-01-01', extra = {} }) {
  const C = T3 + 1;
  const jaren = {};
  const ib = {};
  [T3 - 2, T3 - 1, T3].forEach((y, i) => {
    jaren[y] = { status: 'definitief', vw: { omzet: sfw[i] }, balans: { liquideMiddelen: 10000, evKapitaal: 10000 } };
    ib[y] = { perOnd: { o1: { sfw: sfw[i] } } };
  });
  if (ytd !== undefined) {
    jaren[C] = { status: 'tussentijds', van: van || `${C}-01-01`, tot: tot || `${C}-06-30`, vw: { omzet: ytd } };
  }
  return {
    id: 'd1', soort: 'IKV', kader, berekeningsdatum: datum,
    instellingen: { laatsteToetsjaar: T3, vervangOudsteJaar: vervang, ...extra.instellingen },
    ondernemingen: [{ id: 'o1', naam: 'Test EZ', rechtsvorm: 'EZ', startdatum: start, jaren }],
    ib, ...extra.dossier,
  };
}

/** Fictieve DGA-dossier volgens ABN AMRO met loon 60.000 / 62.000 / 65.000 en dividend 10.000 per jaar. */
function dgaDossier() {
  const jaren = {};
  const ib = {};
  const loon = [60000, 62000, 65000];
  [2023, 2024, 2025].forEach((y, i) => {
    jaren[y] = { status: 'definitief', vw: { omzet: 200000, salarisDGA: loon[i], overigeKosten: 80000, vpb: 10000 },
      balans: { liquideMiddelen: 120000, evKapitaal: 18000, evWinstreserve: 72000, klCrediteuren: 30000 } };
    ib[y] = { perOnd: { b1: { loon: loon[i], dividend: 10000, bijtelling: y === 2025 ? 3000 : 0 } } };
  });
  return { id: 'd3', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15',
    instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'b1', naam: 'DGA BV', rechtsvorm: 'BV', startdatum: '2015-01-01', aandeelPct: 100, jaren }], ib };
}

/** Bedrijf met alleen totaalposten (BZI-invoer). */
function aggBV(id, naam, extra = {}, jaarExtra = {}) {
  const jaren = {};
  [2023, 2024, 2025].forEach((y) => {
    jaren[y] = { status: 'definitief',
      bzi: { omzet: 200000, nettowinst: 40000, ev: 80000, bt: 200000, va: 90000, kvv: 50000 }, ...(jaarExtra[y] || {}) };
  });
  return { id, naam, rechtsvorm: 'BV', startdatum: '2012-01-01', aandeelPct: 100, jaren, ...extra };
}

test('periodes: extrapolatiefactor 30/360 en duur ondernemerschap', () => {
  assert.equal(P.extrapolatiefactor('2024-01-01', '2024-05-31'), 2.4);
  assert.equal(P.extrapolatiefactor('2023-01-01', '2023-05-30'), 2.4);
  assert.equal(P.extrapolatiefactor('2024-01-01', '2024-12-31'), 1);
  assert.equal(P.maandenInclusief('2021-05-19', '2024-05-31'), 36.4);
  const d = P.duur('2021-05-19', '2024-06-03');
  assert.deepEqual([d.jaren, d.maanden, d.dagen], [3, 0, 14]);
  assert.equal(P.geldigTot('2024-06-07'), '2024-12-06');
  assert.equal(P.geldigTot('2024-06-10'), '2024-12-09');
});

test('invoer: Nederlandse bedragnotatie', () => {
  assert.equal(parseBedrag('38.896'), 38896);
  assert.equal(parseBedrag('1.234,50'), 1234.5);
  assert.equal(parseBedrag('-1.307'), -1307);
  assert.equal(parseBedrag('€ 2.500'), 2500);
  assert.equal(parseBedrag(''), null);
});

test('NHG bijlage II voorbeeld 1: lopend jaar in lijn, gemiddelde 3 jaar', () => {
  const r = bereken(ezDossier({ sfw: [43000, 45000, 50000], ytd: 30000 }));
  assert.equal(r.inkomen.basis, 46000);
  assert.equal(r.inkomen.box1, 46000);
});

test('NHG bijlage II voorbeeld 2: geëxtrapoleerd lager dan gemiddelde', () => {
  const r = bereken(ezDossier({ sfw: [43000, 45000, 50000], ytd: 20000 }));
  assert.equal(r.inkomen.controleExtr, 40000);
  assert.equal(r.inkomen.box1, 40000);
});

test('NHG bijlage II voorbeeld 3: vervanging, laatste jaar hoger dan B', () => {
  const r = bereken(ezDossier({ sfw: [42000, 45000, 50000], ytd: 45000, vervang: true }));
  assert.equal(r.inkomen.box1, 46667);
});

test('NHG bijlage II voorbeeld 4: maximeren op laatste volledige boekjaar', () => {
  const r = bereken(ezDossier({ sfw: [20000, 71000, 32500], ytd: 30000 }));
  assert.equal(r.inkomen.box1, 32500);
});

test('NHG bijlage II voorbeeld 5: vervanging, toetsinkomen = lopend jaar YTD', () => {
  const r = bereken(ezDossier({ sfw: [20000, 71000, 32500], ytd: 40000, vervang: true }));
  assert.equal(r.inkomen.box1, 40000);
});

test('NHG bijlage II voorbeeld 6: vervanging, gemiddelde met lopend jaar', () => {
  const r = bereken(ezDossier({ sfw: [20000, 61000, 44000], ytd: 90000, vervang: true }));
  assert.equal(r.inkomen.box1, 65000);
});

test('Rekenvoorbeeld rapportage: vervanging met bijzondere baten en factor 2,4', () => {
  const d = ezDossier({ datum: '2023-05-31', T3: 2022, sfw: [3759, 18519, 29032], ytd: 11731,
    van: '2023-01-01', tot: '2023-05-30', vervang: true });
  d.ondernemingen[0].jaren[2022].vw.bijzondereBaten = 3941;
  const r = bereken(d);
  assert.equal(r.ondernemingen[0].jaren[2022].inkomen.totaal, 25091);
  assert.equal(r.inkomen.controleExtr, 28154);
  assert.equal(r.inkomen.box1, 18447);
});

test('NHG bijlage I: bandbreedtemodel solvabiliteit', () => {
  const bb = KADERS.NHG.bandbreedte;
  assert.equal(bandbreedte(0.31, 0.27, null, bb).status, 'attentie');
  assert.equal(bandbreedte(0.31, 0.27, 0.28, bb).status, 'akkoord');
  assert.equal(bandbreedte(0.31, 0.27, 0.26, bb).status, 'niet_akkoord');
  assert.equal(bandbreedte(0.25, 0.23, 0.25, bb).status, 'akkoord');
  assert.equal(bandbreedte(0.25, 0.23, 0.24, bb).status, 'niet_akkoord');
  assert.equal(bandbreedte(0.40, 0.35, null, bb).status, 'akkoord');
  assert.equal(bandbreedte(0.18, 0.23, null, bb).status, 'attentie');
  assert.equal(bandbreedte(0.10, 0.19, null, bb).status, 'niet_akkoord');
});

test('NHG loondienst ≥ 80%: maximaal ondernemersinkomen A + B', () => {
  const t = dertigProcentToets({ actueelPct: 80, loonJaar: 36000 }, KADERS.NHG);
  assert.equal(t.A, 13500);
  assert.equal(t.B, 9000);
  assert.equal(t.max, 22500);
  assert.equal(dertigProcentToets({ actueelPct: 60, loonJaar: 36000 }, KADERS.NHG), null);
});

test('Maximaal te onttrekken op basis van de meest recente balans', () => {
  const d = ezDossier({ datum: '2024-06-03', T3: 2023, sfw: [35638, 45087, 57029], ytd: 28205,
    van: '2024-01-01', tot: '2024-05-31', start: '2021-05-19' });
  d.ondernemingen[0].jaren[2024].balans = {
    mvaOverig: 17810, voorraden: 2500, debiteuren: 10296, vordOverig: 210, liquideMiddelen: 10320,
    evKapitaal: 38896, klCrediteuren: 1, klOverig: 2239,
  };
  const r = bereken(d);
  const o = r.ondernemingen[0];
  assert.equal(o.jaren[2024].bal.TA, 41136);
  assert.equal(o.jaren[2024].CR, 10.41);
  assert.equal(o.maxOnttrekken, 21086);
});

test('NHG box 2: dubbele balanstoets solvabiliteit', () => {
  const jaren = {};
  const ib = {};
  [2019, 2020, 2021].forEach((y) => {
    jaren[y] = { status: 'definitief',
      vw: { omzet: 100000, overigeKosten: 50000 },
      balans: { mvaOverig: 177571, liquideMiddelen: 78760, evWinstreserve: 253026, klCrediteuren: 3305 } };
    ib[y] = { perOnd: { b1: { loon: 50000 } } };
  });
  const d = { id: 'd2', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2022-06-01',
    instellingen: { laatsteToetsjaar: 2021, box2Route: 'route2' },
    ondernemingen: [{ id: 'b1', naam: 'Test BV', rechtsvorm: 'BV', startdatum: '2004-03-29', aandeelPct: 100, jaren }], ib };
  const r = bereken(d);
  const b2 = r.ondernemingen[0].box2;
  assert.equal(b2.dbt.solvabiliteit, 251924);
  assert.equal(b2.dbt.liquiditeit, 75455);
  assert.equal(b2.route2, Math.round(50000 * 0.75));
});

/** ABN-holding met totaalposten: nettowinst 100.000, box 2 dividend 20.000, loon 60.000 per jaar. */
function owDossier({ ev = 300000, bt = 600000, va = 200000, kvv = 150000, overwinst = {} } = {}) {
  const jaren = {};
  const ib = {};
  [2023, 2024, 2025].forEach((y) => {
    jaren[y] = { status: 'definitief', bzi: { omzet: 400000, nettowinst: 100000, ev, bt, va, kvv } };
    ib[y] = { perOnd: { h1: { loon: 60000, dividend: 20000 } } };
  });
  return { id: 'ow', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'h1', naam: 'Holding BV', rechtsvorm: 'BV', startdatum: '2015-01-01', aandeelPct: 100, jaren,
      overwinst: { meenemen: true, kasstroomBevestigd: true, ...overwinst } }], ib };
}

test('Overwinst ABN: dubbele balanstoets begrenst op de liquiditeit na uitkering', () => {
  const r = bereken(owDossier());
  const a = r.ondernemingen[0];
  const ow = a.box2.overwinst;
  assert.equal(ow.ow[2025], 80000); // 100.000 nettowinst -/- 20.000 uitgekeerd dividend
  assert.equal(ow.basis, 80000);
  assert.equal(ow.dbt.maxSolv, 225000); // (300.000 - 20% × 600.000) / 80%
  assert.equal(ow.dbt.maxLiq, 50000); // 200.000 - 1 × 150.000
  assert.equal(ow.naDbt, 50000);
  assert.equal(a.box2.nietUitgekeerd, 50000);
  assert.equal(a.box2.totaal, 70000); // 20.000 uitgekeerd + 50.000 overwinst
  const h = r.inkomen.perHoofdbedrijf[0];
  assert.equal(h.berekend, 80000); // rekentool: 60.000 + 20.000, zonder overwinst
  assert.equal(h.woonbeleidVoorAfslag, 130000);
  assert.ok(r.meldingen.some((m) => m.actie?.soort === 'woonbeleid-overnemen' && m.actie.bedrag === 130000));
  assert.match(h.onderbouwing, /Dubbele balanstoets/);
});

test('Overwinst ABN: solvabiliteit na onttrekking begrenst, opties cumulatief en werkkapitaal', () => {
  const sv = bereken(owDossier({ ev: 150000 })).ondernemingen[0].box2.overwinst;
  assert.equal(sv.dbt.maxSolv, 37500); // (150.000 - 120.000) / 80%
  assert.equal(sv.naDbt, 37500);
  const na = naOnttrekking(sv.dbt.perJaar[2025], 37500);
  assert.equal(na.SV, 0.2);
  const cum = bereken(owDossier({ overwinst: { jaren: 'alle', cumulatief: true } })).ondernemingen[0].box2.overwinst;
  assert.equal(cum.dbt.maxLiq, 16667); // 50.000 / 3 in het laatste toetsjaar
  assert.equal(cum.naDbt, 16667);
  const wk = bereken(owDossier({ overwinst: { liqMethode: 'werkkapitaal', solvNorm: 0.25 } })).ondernemingen[0].box2.overwinst;
  assert.equal(wk.dbt.maxSolv, 200000); // (300.000 - 25% × 600.000) / 75%
  assert.equal(wk.dbt.maxLiq, 50000);
});

test('Overwinst ABN: balanstest zonder herwaarderingsreserve en wettelijke reserves', () => {
  const jaren = {};
  const ib = {};
  [2023, 2024, 2025].forEach((y) => {
    jaren[y] = { status: 'definitief', vw: { omzet: 500000, overigeKosten: 400000 },
      balans: { mvaOverig: 200000, liquideMiddelen: 300000, evKapitaal: 18000, evWinstreserve: 50000, evOverig: 30000, llLeningen: 302000, klCrediteuren: 100000 },
      balansDetail: { evOverig: { herwaardering: 20000, overig: 10000 } } };
    ib[y] = { perOnd: { b1: { loon: 60000, dividend: 40000 } } };
  });
  const d = { id: 'bt', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'b1', naam: 'Detail BV', rechtsvorm: 'BV', startdatum: '2010-01-01', aandeelPct: 100, jaren,
      overwinst: { meenemen: true, kasstroomBevestigd: true } }], ib };
  const ow = bereken(d).ondernemingen[0].box2.overwinst;
  assert.equal(ow.basis, 60000); // 100.000 nettowinst -/- 40.000 dividend
  assert.equal(ow.vrij, 60000); // 50.000 winstreserve + 30.000 overig -/- 20.000 herwaarderingsreserve
  assert.match(ow.vrijLabel, /zonder herwaarderings- en wettelijke reserves/);
  assert.equal(ow.naDbt, Math.min(60000, ow.dbt.max));
});

test('Overwinst ABN: niet meenemen zonder kasstroomonderbouwing of zonder volledige zeggenschap', () => {
  const zonder = bereken(owDossier({ overwinst: { kasstroomBevestigd: false } }));
  assert.equal(zonder.ondernemingen[0].box2.nietUitgekeerd, 0);
  assert.ok(zonder.meldingen.some((m) => /overwinst wordt niet meegenomen/.test(m.tekst)));
  const d = owDossier();
  d.ondernemingen[0].aandeelPct = 70;
  const r = bereken(d);
  assert.equal(r.ondernemingen[0].box2.overwinst.toegestaan, false);
  d.ondernemingen[0].zeggenschap = true; // aangetoond, bijvoorbeeld met een vast dividendbeleid
  assert.equal(bereken(d).ondernemingen[0].box2.overwinst.toegestaan, true);
});

test('Kort eerste boekjaar wordt gesignaleerd', () => {
  const d = { id: 'kort', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('k1', 'Nieuwe BV', { startdatum: '2023-08-31' })], ib: {} };
  const a = bereken(d).ondernemingen[0];
  const c = a.checks.find((x) => x.key === 'kort2023');
  assert.ok(c);
  assert.match(c.tekst, /4 maanden/);
  assert.ok(!a.checks.some((x) => x.key === 'kort2024'));
});

test('ABN starter: 1-2 boekjaren geeft 75% van het gemiddelde (afslag apart getoond)', () => {
  const d = ezDossier({ kader: 'ABN', datum: '2026-07-15', T3: 2025, sfw: [0, 20000, 40000], start: '2024-04-01' });
  delete d.ib[2023];
  delete d.ondernemingen[0].jaren[2023];
  const r = bereken(d);
  const o = r.inkomen.perHoofdbedrijf[0];
  assert.equal(o.maanden, 21);
  assert.equal(o.berekend, 30000);
  assert.equal(o.toets, 22500);
  assert.equal(r.toetsinkomen, 22500);
  // Het berekend inkomen wordt zonder afslag afgegeven; de afslag volgt in het acceptatiesysteem.
  assert.equal(r.vastgesteld, 30000);
});

test('ABN BZI: berekend inkomen = gemiddeld DGA-inkomen na bijtelling + gemiddeld dividend', () => {
  const r = bereken(dgaDossier());
  const o = r.inkomen.perHoofdbedrijf[0];
  assert.equal(o.bziInkomen, 61333);
  assert.equal(o.bziDividend, 10000);
  assert.equal(o.berekend, 71333);
  assert.equal(o.woonbeleid, 71333);
  assert.equal(r.berekend, 71333);
  assert.equal(r.toetsinkomen, 71333);
  assert.equal(r.vastgesteld, 71333);
  assert.equal(r.status, 'akkoord');
});

test('ABN BZI: een niet-meegeteld jaar valt buiten het gemiddelde', () => {
  const d = dgaDossier();
  d.ondernemingen[0].jaren[2023].meetellen = false;
  const r = bereken(d);
  const o = r.inkomen.perHoofdbedrijf[0];
  assert.equal(o.bziInkomen, 62000);
  assert.deepEqual(r.ondernemingen[0].meegeteldeJaren, [2024, 2025]);
});

test('ABN BZI: totaalposten, ratio\'s en ruimtes', () => {
  const d = { id: 'agg', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('h1', 'Holding BV')], ib: {} };
  const r = bereken(d);
  const j = r.ondernemingen[0].jaren[2025];
  assert.equal(j.aggBalans, true);
  assert.equal(j.SV, 0.4);
  assert.equal(j.CR, 1.8);
  assert.equal(Math.round(j.solvRuimte), 50000); // (80.000 - 20% × 200.000) / 80%
  assert.equal(j.liqRuimte, 40000);
  assert.equal(Math.round(r.ondernemingen[0].gemiddeld.solvRuimte), 50000);
});

test('ABN BZI: vermogenscorrectie R/C directie verlaagt AV, balanstotaal en vlottende activa', () => {
  const corr = { 2025: { vermogensCorrecties: [{ type: 'rcDirectie', bedrag: 10000, toelichting: 'R/C DGA' }] } };
  const d = { id: 'rc', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('h1', 'Holding BV', {}, corr)], ib: {} };
  const j = bereken(d).ondernemingen[0].jaren[2025];
  assert.equal(j.EVcor, 70000);
  assert.equal(j.TVcor, 190000);
  assert.equal(j.VAcor, 80000);
  assert.equal(j.KVVcor, 50000);
  assert.equal(getekend('rcDirectie', 10000, VERMOGENS_CORRECTIES), -10000);
  assert.equal(getekend('incidenteleLast', -500, WINST_CORRECTIES), 500);
});

test('ABN BZI: samenstelling vlottende activa geeft automatische correctie R/C en G-rekening', () => {
  const vaDetail = { 2025: { bzi: { omzet: 200000, nettowinst: 40000, ev: 80000, bt: 200000, va: 90000, kvv: 50000,
    vaDetail: { rcDirectie: 8000, nietVrij: 2000 } } } };
  const d = { id: 'va', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('h1', 'Holding BV', {}, vaDetail)], ib: {} };
  const j = bereken(d).ondernemingen[0].jaren[2025];
  assert.equal(j.EVcor, 72000);
  assert.equal(j.VAcor, 80000); // 90.000 - 8.000 R/C - 2.000 niet vrij beschikbaar
  // Een handmatige correctie van hetzelfde type vervangt de automatische
  vaDetail[2025].vermogensCorrecties = [{ type: 'rcDirectie', bedrag: 5000 }];
  const d2 = { ...d, ondernemingen: [aggBV('h1', 'Holding BV', {}, vaDetail)] };
  const j2 = bereken(d2).ondernemingen[0].jaren[2025];
  assert.equal(j2.EVcor, 75000);
  assert.equal(j2.VAcor, 83000);
});

test('ABN BZI: winstcorrectie incidentele baat vervangt de automatische correctie', () => {
  const d = dgaDossier();
  d.ondernemingen[0].jaren[2025].vw.bijzondereBaten = 9000;
  let a = bereken(d).ondernemingen[0].jaren[2025];
  assert.equal(a.winst.NWcor, a.winst.NW - 9000);
  d.ondernemingen[0].jaren[2025].winstCorrecties = [{ type: 'incidenteleBaat', bedrag: 3000, toelichting: 'boekwinst' }];
  a = bereken(d).ondernemingen[0].jaren[2025];
  assert.equal(a.winst.NWcor, a.winst.NW - 3000);
});

test('ABN BZI: toetskader niet gehaald, berekend inkomen blijft zichtbaar', () => {
  const zwak = { 2023: { bzi: { omzet: 100000, nettowinst: 20000, ev: 10000, bt: 200000, va: 40000, kvv: 80000 } },
    2024: { bzi: { omzet: 100000, nettowinst: 20000, ev: 12000, bt: 200000, va: 40000, kvv: 80000 } },
    2025: { bzi: { omzet: 100000, nettowinst: 20000, ev: 15000, bt: 200000, va: 40000, kvv: 80000 } } };
  const h = aggBV('h1', 'Holding BV', {}, zwak);
  const d = { id: 'zw', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [h], ib: { 2023: { perOnd: { h1: { loon: 50000 } } }, 2024: { perOnd: { h1: { loon: 50000 } } }, 2025: { perOnd: { h1: { loon: 50000 } } } } };
  const r = bereken(d);
  const o = r.inkomen.perHoofdbedrijf[0];
  assert.equal(o.voldoet, false);
  assert.equal(r.status, 'niet_akkoord');
  assert.equal(o.berekend, 50000);
  assert.equal(r.vastgesteld, 50000);
  assert.ok(r.meldingen.some((m) => /toetskader/.test(m.tekst)));
});

test('ABN BZI: deelnemingen tellen mee in het toetskader van het hoofdbedrijf', () => {
  const zwak = { 2025: { bzi: { omzet: 100000, nettowinst: 5000, ev: -50000, bt: 200000, va: 30000, kvv: 90000 } },
    2024: { bzi: { omzet: 100000, nettowinst: 5000, ev: -40000, bt: 200000, va: 30000, kvv: 90000 } },
    2023: { bzi: { omzet: 100000, nettowinst: 5000, ev: -30000, bt: 200000, va: 30000, kvv: 90000 } } };
  const d = { id: 'grp', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('h1', 'Holding BV'), aggBV('w1', 'Werk BV', { parentId: 'h1' }, zwak)], ib: {} };
  const r = bereken(d);
  const o = r.inkomen.perHoofdbedrijf[0];
  assert.deepEqual(o.groep, ['h1', 'w1']);
  assert.equal(o.voldoet, false);
  assert.deepEqual(o.nietVoldoend, ['Werk BV']);
});

test('ABN BZI: geldstromen management fee en intern dividend worden aangesloten', () => {
  const kind = aggBV('w1', 'Werk BV', { parentId: 'h1' }, { 2025: { bzi: { omzet: 200000, nettowinst: 40000, ev: 80000, bt: 200000, va: 90000, kvv: 50000, managementFee: 50000, internDividend: 30000 } } });
  const ouder = aggBV('h1', 'Holding BV', {}, { 2025: { bzi: { omzet: 45000, nettowinst: 70000, ev: 80000, bt: 200000, va: 90000, kvv: 50000 },
    geldstromen: { ontvangenFee: { w1: 45000 }, ontvangenDividend: { w1: 30000 } } } });
  const d = { id: 'gs', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [ouder, kind], ib: {} };
  const r = bereken(d);
  const gs = r.inkomen.perHoofdbedrijf[0].geldstromen;
  const fee = gs.find((x) => x.soort === 'fee');
  const div = gs.find((x) => x.soort === 'dividend');
  assert.equal(fee.perJaar[2025].verschil, 5000);
  assert.equal(div.perJaar[2025].verschil, 0);
  assert.ok(r.meldingen.some((m) => /Management fee/.test(m.tekst)));
});

test('Structuur: geneste en gedeelde deelnemingen en organogram', () => {
  const d = {
    aanvrager: { voorletters: 'A.', achternaam: 'Voorbeeld' },
    ondernemingen: [
      { id: 'h1', naam: 'Alfa Holding B.V.', rechtsvorm: 'BV', aandeelPct: 100 },
      { id: 'h2', naam: 'Beta Holding B.V.', rechtsvorm: 'BV', aandeelPct: 100 },
      { id: 'd1', naam: 'Gamma B.V.', rechtsvorm: 'BV', parentId: 'h1', aandeelPct: 25, extraParents: [{ id: 'h2', pct: 25 }] },
      { id: 'd2', naam: 'Delta B.V.', rechtsvorm: 'BV', parentId: 'd1', aandeelPct: 100 },
    ],
  };
  const st = structuur(d);
  assert.equal(st.hoofden.length, 2);
  const h1 = st.hoofden.find((h) => h.id === 'h1');
  const h2 = st.hoofden.find((h) => h.id === 'h2');
  assert.deepEqual(h1.afstammelingen.map((x) => [x.id, x.indirect]), [['d1', 0.25], ['d2', 0.25]]);
  assert.deepEqual(h2.afstammelingen.map((x) => [x.id, x.indirect]), [['d1', 0.25], ['d2', 0.25]]);
  const tekst = organogramTekst(d);
  assert.match(tekst, /^Voorbeeld, A\./);
  assert.match(tekst, /> 25% Gamma B\.V\./);
  assert.equal((tekst.match(/Delta B\.V\./g) || []).length, 2);
});

test('Organogram: overige aandeelhouders, STAK met certificaathouders en controle van de belangen', () => {
  const d = {
    aanvrager: { voorletters: 'A.', achternaam: 'Voorbeeld' },
    ondernemingen: [
      { id: 'h1', naam: 'Alfa Holding B.V.', rechtsvorm: 'BV', aandeelPct: 100 },
      { id: 'c1', naam: 'Centraal B.V.', rechtsvorm: 'BV', parentId: 'h1', aandeelPct: 10 },
      { id: 'w1', naam: 'Werk B.V.', rechtsvorm: 'BV', parentId: 'c1', aandeelPct: 100 },
    ],
    organogram: {
      knopen: [
        { id: 'k1', soort: 'bv', naam: 'Omega Holding B.V.' },
        { id: 'k2', soort: 'stak', naam: 'STAK Omega', toelichting: 'Bestuurder: B. Voorbeeld' },
        { id: 'k3', soort: 'persoon', naam: 'B. Voorbeeld' },
      ],
      lijnen: [
        { van: 'k1', naar: 'c1', pct: 60 },
        { van: 'k2', naar: 'k1', pct: 100 },
        { van: 'k3', naar: 'k2', pct: 100, soort: 'certificaten' },
      ],
    },
  };
  const graaf = organogramGraaf(d);
  assert.equal(graaf.knopen.length, 7); // aanvrager, 3 ondernemingen en 3 overige knopen
  assert.ok(graaf.lijnen.some((l) => l.van === 'aanvrager' && l.naar === 'h1' && l.auto));
  assert.ok(graaf.lijnen.some((l) => l.van === 'k3' && l.soort === 'certificaten'));
  assert.ok(graaf.controles.some((c) => c.id === 'c1' && /30%/.test(c.tekst)));
  const tekst = organogramTekst(d);
  assert.match(tekst, /overige aandeelhouders: 60% Omega Holding B\.V\. ← 100% STAK Omega/);
  assert.match(tekst, /certificaten B\. Voorbeeld/);
});

test('Organogram: STAK met certificaten van meer vennootschappen, elk met eigen certificaathouders', () => {
  const d = {
    aanvrager: { voorletters: 'A.', achternaam: 'Voorbeeld' },
    ondernemingen: [
      { id: 'h1', naam: 'Eigen Holding B.V.', rechtsvorm: 'BV', aandeelPct: 100 },
      { id: 'c1', naam: 'Centraal B.V.', rechtsvorm: 'BV', parentId: 'h1', aandeelPct: 20 },
    ],
    organogram: {
      knopen: [
        { id: 'stak', soort: 'stak', naam: 'STAK Noord' },
        { id: 'b1', soort: 'bv', naam: 'Noord Een B.V.' },
        { id: 'b2', soort: 'bv', naam: 'Noord Twee B.V.' },
        { id: 'p1', soort: 'persoon', naam: 'P. Een' },
        { id: 'p2', soort: 'persoon', naam: 'P. Twee' },
        { id: 'p3', soort: 'persoon', naam: 'P. Drie' },
      ],
      lijnen: [
        { van: 'b1', naar: 'c1', pct: 50 }, { van: 'b2', naar: 'c1', pct: 30 },
        { van: 'stak', naar: 'b1', pct: 100 }, { van: 'stak', naar: 'b2', pct: 100 },
        { van: 'p1', naar: 'stak', pct: 100, soort: 'certificaten', voor: 'b1' },
        { van: 'p2', naar: 'stak', pct: 50, soort: 'certificaten', voor: 'b2' },
        { van: 'p3', naar: 'stak', pct: 50, soort: 'certificaten', voor: 'b2' },
      ],
    },
  };
  const graaf = organogramGraaf(d);
  const klasse = (van, naar) => graaf.lijnen.find((l) => l.van === van && l.naar === naar)?.klasse;
  assert.equal(klasse('p1', 'stak'), klasse('stak', 'b1')); // zelfde kleur: certificaathouder en vennootschap
  assert.equal(klasse('p2', 'stak'), klasse('stak', 'b2'));
  assert.notEqual(klasse('p1', 'stak'), klasse('p2', 'stak'));
  assert.equal(klasse('b1', 'c1'), undefined);
  assert.equal(graaf.controles.length, 0); // 20% + 50% + 30% = 100%; certificaten per vennootschap 100%
  const tekst = organogramTekst(d);
  assert.match(tekst, /50% Noord Een B\.V\. ← 100% STAK Noord ← 100% certificaten P\. Een;/);
  assert.match(tekst, /30% Noord Twee B\.V\. ← 100% STAK Noord ← 50% certificaten P\. Twee, 50% certificaten P\. Drie\)/);
  // Zonder keuze "certificaten van" bij een STAK met meer vennootschappen: melding
  d.organogram.lijnen[4].voor = '';
  assert.ok(organogramGraaf(d).controles.some((c) => c.id === 'stak' && /kies bij de certificaathouders/.test(c.tekst)));
});

test('Organogram: medeaandeelhouder in het hoofdbedrijf en een hoofdbedrijf dat via een STAK wordt gehouden', () => {
  const basis = {
    aanvrager: { voorletters: 'A.', achternaam: 'Voorbeeld' },
    ondernemingen: [{ id: 'h1', naam: 'Samen B.V.', rechtsvorm: 'BV', aandeelPct: 50 }],
  };
  // 50/50 met een medeaandeelhouder: de lijn van de aanvrager blijft staan en de belangen sluiten.
  const samen = organogramGraaf({ ...basis, organogram: { knopen: [{ id: 'k1', soort: 'persoon', naam: 'C. Partner' }], lijnen: [{ van: 'k1', naar: 'h1', pct: 50 }] } });
  assert.ok(samen.lijnen.some((l) => l.van === 'aanvrager' && l.naar === 'h1' && l.pct === 0.5));
  assert.equal(samen.controles.length, 0);
  // Aanvrager houdt certificaten van een STAK die de aandelen houdt: geen directe lijn.
  const stak = organogramGraaf({ ...basis, organogram: {
    knopen: [{ id: 'k2', soort: 'stak', naam: 'STAK Samen' }],
    lijnen: [{ van: 'aanvrager', naar: 'k2', pct: 100, soort: 'certificaten' }, { van: 'k2', naar: 'h1', pct: 100 }] } });
  assert.ok(!stak.lijnen.some((l) => l.van === 'aanvrager' && l.naar === 'h1'));
  assert.ok(stak.lijnen.some((l) => l.van === 'aanvrager' && l.naar === 'k2' && l.soort === 'certificaten'));
});

test('Geldstromen met partijen buiten de berekening worden aangesloten', () => {
  const d = { id: 'gs', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [aggBV('h1', 'Holding BV')], ib: {},
    organogram: { knopen: [{ id: 'k1', soort: 'bv', naam: 'Derde B.V.' }], lijnen: [] },
    geldstromenExtra: [{ van: 'h1', naar: 'k1', soort: 'fee', perJaar: { 2025: { van: 95700, naar: 91500 } } }] };
  const r = bereken(d);
  const gs = r.inkomen.geldstromen.find((x) => x.extra);
  assert.equal(gs.naarNaam, 'Derde B.V.');
  assert.equal(gs.perJaar[2025].verschil, 4200);
  assert.ok(r.meldingen.some((m) => /Management fee Holding BV → Derde B\.V\. sluit niet aan in 2025/.test(m.tekst)));
});

test('Berekeningswijzen 1-1-1, 1-2-3 en 1-3-4', () => {
  const m = vergelijkMethoden({ 2023: 30000, 2024: 40000, 2025: 60000 }, [2023, 2024, 2025]);
  assert.equal(m.gemiddelde, 43333);
  assert.equal(m.m111, 43333);
  assert.equal(m.gewogen, 48333);
  assert.equal(m.m123, 48333);
  assert.equal(m.gewogen134, 48750);
  assert.equal(m.m134, 48750);
  const m2 = vergelijkMethoden({ 2023: 40000, 2024: 50000, 2025: 45000 }, [2023, 2024, 2025]);
  assert.equal(m2.m111, 45000);
  assert.equal(m2.m123, 45000);
  assert.equal(m2.gewogen134, 46250);
  assert.equal(m2.m134, 45000);
});

test('Lening directie: annuïteit en contractuele termijn', () => {
  assert.equal(Math.round(annuiteit(100000, 3, 360) * 100) / 100, 421.6);
  assert.equal(annuiteit(12000, 0, 12), 1000);
  const ld = berekenLeningDirectie({ hoofdsom: 100000, rente: 3, looptijdMnd: 360 });
  assert.equal(ld.maandlast, 421.6);
  assert.equal(berekenLeningDirectie({ hoofdsom: 100000, rente: 3, looptijdMnd: 360, termijn: 450 }).maandlast, 450);
});

test('DGA-inkomen lopend jaar uit de salarisstrook', () => {
  const s = salarisPeriode({ maandsalaris: 5000, vakantiegeldPct: 8, maanden: 6 });
  assert.equal(s.jaar, 64800);
  assert.equal(s.bedrag, 32400);
  assert.equal(salarisPeriode({ maandsalaris: 5000, vakantiegeldPct: 8, dertiendeMaand: true, maanden: 12 }).bedrag, 69800);
});

test('Zakelijke kredieten: lijst, oud formaat en kasstroomtoets', () => {
  assert.deepEqual(zkLijst({ nul: { zk: { ja: true, maandlast: 250, prive: true } } }).map((x) => [x.maandlast, x.gedragenDoor]), [[250, 'prive']]);
  const d = {
    id: 'n1', soort: 'NUL', kader: 'ABN', berekeningsdatum: '2026-03-01', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'w1', naam: 'Webshop', rechtsvorm: 'EZ', startdatum: '2020-02-01',
      jaren: { 2025: { vw: { omzet: 30000, overigeKosten: 26000 } } } }],
    zk: [{ kredietgever: 'Lease BV', soort: 'lease', maandlast: 500, gedragenDoor: 'onderneming', status: 'lopend', ondId: 'w1' },
      { kredietgever: 'Bank', soort: 'krediet', maandlast: 300, status: 'afgelost', afgelostIn: '2024' }],
    ib: {},
  };
  const r = bereken(d);
  const kas = r.nul.perOnderneming[0].checks.find((c) => c.key === 'kasstroom');
  assert.equal(kas.status, 'niet_akkoord'); // 4.000 winst - 6.000 lease = tekort
  const zk = r.nul.zekerheden.find((c) => c.key === 'zk');
  assert.equal(zk.status, 'attentie');
  assert.match(zk.tekst, /afgelost in 2024/);
});

test('0-verklaring: ongedekt verlies leidt tot maandlastcorrectie', () => {
  const d = {
    id: 'd4', soort: 'NUL', kader: 'ABN', berekeningsdatum: '2026-03-01',
    instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'w1', naam: 'Webshop', rechtsvorm: 'EZ', startdatum: '2023-02-01',
      jaren: { 2025: { vw: { omzet: 1000, overigeKosten: 6000 } } } }],
    ib: {},
  };
  const r = bereken(d);
  assert.equal(r.vastgesteld, 0);
  assert.equal(r.nul.maandlastCorrectie, 417);
  assert.equal(r.nul.status, 'attentie');
  d.nul = { hobbymatig: true };
  assert.equal(bereken(d).nul.maandlastCorrectie, 0);
});

test('Rekening-courant directie: maandlast op basis van saldo en rente', () => {
  assert.equal(berekenRC({ saldo: 60000, rente: 6 }).maandlast, 300);
  assert.equal(berekenRC({ saldo: 60000, rente: 6, kasrondje: true }).maandlast, 0);
});

test('NHG: niet akkoord leidt tot € 0 tenzij afwijkend inkomen is gemotiveerd', () => {
  const d = ezDossier({ sfw: [30000, 30000, 30000] });
  d.ondernemingen[0].jaren[2025].balans = { liquideMiddelen: 5000, evKapitaal: -20000, klCrediteuren: 25000 };
  const r = bereken(d);
  assert.equal(r.status, 'niet_akkoord');
  assert.equal(r.vastgesteld, 0);
  d.afwijkend = { actief: true, bedrag: 25000, motivatie: 'test' };
  assert.equal(bereken(d).vastgesteld, 25000);
});

test('NHG: hypothecaire vordering op de DGA (uitgebreide modus) wordt niet gecorrigeerd', () => {
  const jaren = {};
  const ib = {};
  [2023, 2024, 2025].forEach((y) => {
    jaren[y] = { status: 'definitief', vw: { omzet: 150000, salarisDGA: 50000, overigeKosten: 60000, vpb: 6000 },
      balans: { fvaDGA: 40000, liquideMiddelen: 80000, evKapitaal: 18000, evWinstreserve: 82000, klCrediteuren: 20000 },
      balansDetail: { fvaDGA: { nietHyp: 10000, hyp: 30000 } } };
    ib[y] = { perOnd: { b1: { loon: 50000 } } };
  });
  const d = { id: 'dga', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'b1', naam: 'DGA BV', rechtsvorm: 'BV', startdatum: '2010-01-01', aandeelPct: 100, jaren }], ib };
  const j = bereken(d).ondernemingen[0].jaren[2025];
  assert.equal(j.EVcor, 100000 - 10000);
});

test('Uitgebreide modus: post is de som van de onderdelen', () => {
  assert.equal(detailSom({ a: 100, b: '', c: 50.5 }), 150.5);
  assert.equal(detailSom({ a: '', b: null }), null);
  const jd = { balans: { liquideMiddelen: 1 }, balansDetail: { liquideMiddelen: { kas: 500, bank: 12000 } } };
  assert.equal(pasDetailToe(jd, 'balans', 'liquideMiddelen'), 12500);
  assert.equal(jd.balans.liquideMiddelen, 12500);
});

test('Statussen: oude statussen worden omgezet naar de aanvragenlijst', () => {
  const d = { type: 'dossier', status: 'gereed' };
  assert.equal(migreerDossier(d), true);
  assert.equal(d.status, 'beoordeling_2');
  const e = { type: 'dossier', status: 'teruggezet' };
  migreerDossier(e);
  assert.equal(e.status, 'beoordeling_1');
  assert.equal(e.teruggezet, true);
  assert.equal(migreerDossier({ type: 'dossier', status: 'afgerond' }), false);
  assert.equal(weergaveVan({ kader: 'ABN' }), 'viiz');
  assert.equal(weergaveVan({ kader: 'ABN' }, 'bzi'), 'bzi');
  assert.equal(weergaveVan({ kader: 'NHG' }, 'bzi'), 'viiz');
  assert.equal(weergaveVan({ kader: 'NHG', weergave: 'bzi' }), 'bzi');
});

test('Grootboek: verdeling saldibalans over de invoerposten', () => {
  const regels = [
    ['001', 'Gebouwen', 100000], ['011', 'Afschrijving gebouwen', -20000], ['040', 'Aandelenkapitaal', -18000],
    ['044', 'Winstreserve', -40000], ['110', 'Bank', 40000], ['130', 'Debiteuren', 15000], ['140', 'Crediteuren', -12000],
    ['161', 'Te betalen vpb', -3000], ['077', 'Hypothecaire lening', -30000], ['800', 'Omzet', -150000],
    ['400', 'Verbruik grondstoffen', 60000], ['410', 'Directe loonkosten', 50000], ['471', 'Afschrijving gebouwen', 5000],
    ['991', 'Vennootschapsbelasting', 3000], ['540', 'Indirecte fabricagekosten', 0],
  ].map(([rekening, omschrijving, saldo]) => ({ rekening, omschrijving, saldo }));
  const v = verdeelGrootboek(regels, { rechtsvorm: 'BV' });
  assert.equal(v.balans.mvaGebouwen, 80000);
  assert.equal(v.balans.liquideMiddelen, 40000);
  assert.equal(v.balans.evKapitaal, 18000);
  assert.equal(v.balans.evOverig, 32000);
  assert.equal(v.balans.llKrediet, 30000);
  assert.equal(v.balans.klVPB, 3000);
  assert.equal(v.vw.omzet, 150000);
  assert.equal(v.vw.inkoopwaarde, 60000);
  assert.equal(v.vw.vpb, 3000);
  assert.equal(v.resultaat, 32000);
  assert.equal(v.verschil, 0);
  assert.equal(v.nietOvergenomen.length, 1);
  assert.equal(postVoorRekening('110', -500).k, 'klKrediet');
  assert.equal(postVoorRekening('178', 2500).k, 'vordDGAKort');
  assert.equal(postVoorRekening('178', -2500).k, 'klDGA');
  const p = parseGrootboekTekst('Rekening;Omschrijving;Saldo\n110;Bank;40.000\n140;Crediteuren;-12.000,50\n130\tDebiteuren\t1.000\t250');
  assert.equal(p.regels.length, 3);
  assert.equal(p.regels[1].saldo, -12000.5);
  assert.equal(p.regels[2].saldo, 750);
  assert.equal(p.fouten.length, 0);
});
