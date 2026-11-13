// Tests voor de toetskaders ASN Bank, Knab en Optimaal, de vergelijking tussen kaders en de verbeteringen
// naar aanleiding van een praktijkdossier. Alle cijfers zijn fictief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken, vergelijkKaders, structuur, belangen } from '../public/js/engine/index.js';
import { KADERS, KADER_VOLGORDE, kaderVoor, sectorControle, starterFactor } from '../public/js/engine/kaders.js';
import { gewogen123 } from '../public/js/engine/totaal.js';

function ezDossier({ kader = 'NHG', datum = '2026-07-15', T3 = 2025, sfw, ytd, van, tot, start = '2010-01-01', ib: ibExtra = {}, extra = {} }) {
  const C = T3 + 1;
  const jaren = {};
  const ib = {};
  [T3 - 2, T3 - 1, T3].forEach((y, i) => {
    if (sfw[i] === null) return;
    jaren[y] = { status: 'definitief', vw: { omzet: sfw[i] }, balans: { liquideMiddelen: 10000, evKapitaal: 10000 } };
    ib[y] = { perOnd: { o1: { sfw: sfw[i], ...(ibExtra[y] || {}) } } };
  });
  if (ytd !== undefined) {
    jaren[C] = { status: 'tussentijds', van: van || `${C}-01-01`, tot: tot || `${C}-06-30`, vw: { omzet: ytd } };
  }
  return {
    id: 'd1', soort: 'IKV', kader, berekeningsdatum: datum,
    instellingen: { laatsteToetsjaar: T3, ...extra.instellingen },
    ondernemingen: [{ id: 'o1', naam: 'Test EZ', rechtsvorm: 'EZ', startdatum: start, jaren, ...extra.ond }],
    ib, ...extra.dossier,
  };
}

function dgaDossier(kader = 'ABN', { loon = [60000, 62000, 65000], kosten = 80000, dividend = 10000 } = {}) {
  const jaren = {};
  const ib = {};
  [2023, 2024, 2025].forEach((y, i) => {
    jaren[y] = { status: 'definitief', vw: { omzet: 200000, salarisDGA: loon[i], overigeKosten: kosten, vpb: 10000 },
      balans: { liquideMiddelen: 120000, evKapitaal: 18000, evWinstreserve: 72000, klCrediteuren: 30000 } };
    ib[y] = { perOnd: { b1: { loon: loon[i], dividend, bijtelling: y === 2025 ? 3000 : 0 } } };
  });
  return { id: 'd3', soort: 'IKV', kader, berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [{ id: 'b1', naam: 'DGA BV', rechtsvorm: 'BV', startdatum: '2015-01-01', aandeelPct: 100, jaren }], ib };
}

function aggBV(id, naam, extra = {}, jaarExtra = {}, bzi = {}) {
  const jaren = {};
  [2023, 2024, 2025].forEach((y) => {
    jaren[y] = { status: 'definitief', bzi: { omzet: 200000, nettowinst: 40000, ev: 80000, bt: 200000, va: 90000, kvv: 50000, ...bzi }, ...(jaarExtra[y] || {}) };
  });
  return { id, naam, rechtsvorm: 'BV', startdatum: '2012-01-01', aandeelPct: 100, jaren, ...extra };
}

test('Kaders: basiskaders en alle aanvullende geldverstrekkers', () => {
  assert.deepEqual(KADER_VOLGORDE, [
    'NHG', 'ABN', 'ASN', 'KNAB', 'OPT', 'VENN', 'ING', 'RABO', 'NIBC',
    'ATTENS', 'SYNTRUS', 'LLOYDS', 'MUNT', 'MERIUS', 'NN', 'ASR', 'BIJBOUWE', 'DYNAMIC', 'BUNQ', 'TULP',
  ]);
  KADER_VOLGORDE.forEach((id) => {
    const k = KADERS[id];
    assert.ok(k.familie && k.totaal && k.correctieModel && k.bron && k.regels?.length, id);
  });
  assert.equal(starterFactor(KADERS.KNAB, 18).factor, 0.8);
  assert.equal(starterFactor(KADERS.ASN, 30).factor, 0.9);
  assert.equal(starterFactor(KADERS.ASN, 40).factor, 1);
});

test('Kaders: instelbare parameters per dossier, binnen grenzen', () => {
  const k = kaderVoor({ kader: 'OPT', instellingen: { kaderParams: { OPT: { 'volatiliteit.drempel': 30, volatiliteit: { max: 500 }, onbekend: 1 } } } });
  assert.equal(k.volatiliteit.drempel, 0.3);
  assert.equal(k.volatiliteit.max, 1);
  assert.equal(k.volatiliteit.factor, 0.5);
  assert.equal(k.onbekend, undefined);
  assert.equal(KADERS.OPT.volatiliteit.drempel, 0.2);
});

test('ASN: IB gemiddelde, maximaal laatste jaar; bijtelling alleen boven 15% van de winst', () => {
  const r = bereken(ezDossier({ kader: 'ASN', sfw: [43000, 45000, 50000], ib: { 2025: { bijtelling: 10000 } } }));
  // 2025: 50.000 - (10.000 - 15% × 50.000) = 47.500; gemiddelde (43.000 + 45.000 + 47.500) / 3 = 45.167
  assert.equal(r.inkomen.perJaar[2025], 47500);
  assert.equal(r.toetsinkomen, 45167);
  assert.equal(r.status, 'akkoord');
  const nhg = bereken(ezDossier({ kader: 'NHG', sfw: [43000, 45000, 50000], ib: { 2025: { bijtelling: 10000 } } }));
  assert.equal(nhg.inkomen.perJaar[2025], 40000);
});

test('ASN starter: voorbeeld uit de risk policy (30 maanden, 90%, werkelijke maanden)', () => {
  const d = ezDossier({ kader: 'ASN', datum: '2024-07-15', T3: 2023, sfw: [null, 15000, 20000], ytd: 15000, start: '2022-01-01' });
  d.ondernemingen[0].prognoseBedrag = 20000;
  const r = bereken(d);
  assert.equal(r.inkomen.starter.factor, 0.9);
  assert.equal(r.inkomen.starter.jaarbasis, 20000);
  assert.equal(r.toetsinkomen, 18000);
});

test('ASN DGA: loon + winst na Vpb + dividend, begrensd op loon + winst na Vpb laatste jaar', () => {
  const r = bereken(dgaDossier('ASN'));
  const b2 = r.ondernemingen[0].box2;
  assert.equal(b2.gemWinst, 47667);
  assert.equal(b2.winstNaDbt, 47667);
  assert.equal(b2.gemDividend, 10000);
  assert.equal(r.inkomen.box1, 62333);
  assert.equal(r.inkomen.capTotaal, 110000);
  assert.equal(r.toetsinkomen, 110000);
});

test('ASN: verlies van de BV telt mee in het inkomen; maximaal drie entiteiten', () => {
  const d = dgaDossier('ASN', { kosten: 200000, dividend: 0 });
  const r = bereken(d);
  const ink = r.ondernemingen[0].jaren[2024].inkomen;
  assert.ok(ink.neg.some((x) => /Verlies BV/.test(x.label)));
  const d2 = { id: 'm', soort: 'IKV', kader: 'ASN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('a', 'A'), aggBV('b', 'B'), aggBV('c', 'C'), aggBV('e', 'E')] };
  const r2 = bereken(d2);
  assert.ok(r2.meldingen.some((m) => m.niveau === 'niet_akkoord' && /maximaal 3/.test(m.tekst)));
  assert.equal(r2.vastgesteld, 0);
});

test('Knab: 1-3-4 (acceptatiegids 2026), maximaal 10% boven 1-1-1 en 20% boven NHG', () => {
  const r = bereken(ezDossier({ kader: 'KNAB', sfw: [30000, 40000, 60000] }));
  // 1-3-4 = 48.750; 1-1-1 + 10% = 47.667; laatste jaar 60.000; NHG 43.333 × 1,2 = 52.000
  assert.equal(r.inkomen.nhgReferentie, 43333);
  assert.equal(r.toetsinkomen, 47667);
  const r2 = bereken(ezDossier({ kader: 'KNAB', sfw: [40000, 50000, 45000] }));
  // 1-3-4 = 46.250; 1-1-1 + 10% = 49.500; laatste jaar 45.000 → 45.000
  assert.equal(r2.toetsinkomen, 45000);
});

test('Knab: weging 1-3-4 standaard, 1-2-3 (concept 2024) instelbaar per dossier', () => {
  assert.deepEqual(KADERS.KNAB.methode123.gewichten, [1, 3, 4]);
  // 1-3-4 = (44.000 + 3 × 40.000 + 4 × 50.000) / 8 = 45.500; 1-2-3 = 45.667; 1-1-1 + 10% = 49.133
  const r = bereken(ezDossier({ kader: 'KNAB', sfw: [44000, 40000, 50000] }));
  assert.equal(r.inkomen.basis, 45500);
  assert.equal(r.toetsinkomen, 45500);
  assert.ok(r.trace.secties.some((sx) => /1-3-4-methode/.test(sx.titel || '')));
  const over = { kaderParams: { KNAB: { methode123: { gewichten: { 1: 2, 2: 3 } } } } };
  const r2 = bereken(ezDossier({ kader: 'KNAB', sfw: [44000, 40000, 50000], extra: { instellingen: over } }));
  assert.equal(r2.toetsinkomen, 45667);
  assert.deepEqual(KADERS.KNAB.methode123.gewichten, [1, 3, 4], 'het basiskader blijft ongewijzigd');
  // Gewogen gemiddelde: ongeldige gewichten vallen terug op 1-2-3
  assert.equal(gewogen123([30000, 40000, 60000], null, [0, 0, 0]).W, 48333);
  assert.equal(gewogen123([30000, 40000, 60000], null, [1, 3, 4]).fW, '(30.000 + 3 × 40.000 + 4 × 60.000) / 8 =');
});

test('Knab starter zonder relevant dienstverband: 90% bij 24-36 maanden', () => {
  const r = bereken(ezDossier({ kader: 'KNAB', sfw: [null, 20000, 40000], start: '2024-03-01' }));
  assert.equal(r.inkomen.starter.factor, 0.9);
  assert.equal(r.toetsinkomen, 27000);
  assert.ok(r.meldingen.some((m) => /prognose/.test(m.tekst)));
});

test('Knab beletperiode: jaar vervangen door het laagste omliggende jaar', () => {
  const d = ezDossier({ kader: 'KNAB', sfw: [50000, 20000, 52000], extra: { instellingen: { belet: { actief: true, jaar: 2024, oorzaak: 'zwangerschapsverlof', motivatie: 'verklaring boekhouder' } } } });
  const r = bereken(d);
  assert.equal(r.inkomen.belet.nieuw, 50000);
  // 1-3-4 over 50.000 / 50.000 / 52.000 = 51.000; 1-1-1 + 10% = 55.733; laatste jaar 52.000; NHG-plafond 20% boven 40.667
  assert.equal(r.inkomen.basis, 51000);
  assert.equal(r.toetsinkomen, Math.min(51000, Math.round(40667 * 1.2)));
});

test('Knab: sectorbeleid (SBI) en strengere solvabiliteit voor een DGA', () => {
  assert.equal(sectorControle(KADERS.KNAB, '92.00 Loterijen').oordeel, 'nee');
  assert.equal(sectorControle(KADERS.KNAB, '56.10 Restaurants').oordeel, 'voorleggen');
  assert.equal(sectorControle(KADERS.KNAB, '62.01 Software'), null);
  assert.equal(sectorControle(KADERS.NHG, '92.00'), null);
  const d = ezDossier({ kader: 'KNAB', sfw: [40000, 45000, 50000] });
  d.ondernemingen[0].sbi = '92.00';
  const r = bereken(d);
  assert.equal(r.ondernemingen[0].checks.find((c) => c.key === 'sector').status, 'niet_akkoord');
});

test('Optimaal: 1-2-3 zonder afslag bij een stabiel inkomen', () => {
  const r = bereken(ezDossier({ kader: 'OPT', sfw: [43000, 45000, 50000] }));
  assert.equal(r.toetsinkomen, 47167);
  assert.equal(r.inkomen.optimaal.afslagV, 0);
});

test('Optimaal: afslag voor beweeglijkheid', () => {
  const r = bereken(ezDossier({ kader: 'OPT', sfw: [20000, 120000, 70000] }));
  assert.equal(r.inkomen.basis, 70000);
  assert.ok(r.inkomen.optimaal.afslagV > 0.19 && r.inkomen.optimaal.afslagV < 0.2);
  assert.equal(r.toetsinkomen, Math.round(70000 * (1 - r.inkomen.optimaal.afslagV)));
});

test('Optimaal: lager lopend jaar weegt naar rato van de periode (6 maanden = 50%)', () => {
  const r = bereken(ezDossier({ kader: 'OPT', sfw: [43000, 45000, 50000], ytd: 15000 }));
  assert.equal(r.inkomen.optimaal.wegingC, 0.5);
  assert.equal(r.toetsinkomen, 38584);
  const nhg = bereken(ezDossier({ kader: 'NHG', sfw: [43000, 45000, 50000], ytd: 15000 }));
  assert.equal(nhg.toetsinkomen, 30000);
});

test('Optimaal: DGA telt loon plus aandeel in de winst na Vpb, begrensd op de uitkeerbare ruimte', () => {
  const r = bereken(dgaDossier('OPT'));
  const b2 = r.ondernemingen[0].box2;
  assert.equal(b2.model, 'OPT');
  assert.equal(b2.P[2025], 45000);
  assert.ok(r.toetsinkomen > r.inkomen.optimaal.box1PerJaar[2025] - 5000);
  assert.equal(r.status, 'akkoord');
});

test('Optimaal: holding met minderheidsbelang telt alleen ontvangen dividend met trackrecord', () => {
  const minder = aggBV('m1', 'Minderheid BV', { parentId: 'h1', aandeelPct: 25 }, {
    2023: { bzi: { omzet: 1000000, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 200000 } },
    2024: { bzi: { omzet: 1000000, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 200000 } },
    2025: { bzi: { omzet: 1000000, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 200000 } },
  });
  // De holding boekt het ontvangen dividend (25% van 200.000) in de nettowinst; Optimaal haalt het daar weg en telt het bij de bron.
  const holding = aggBV('h1', 'Holding BV', {}, {}, { omzet: 0, nettowinst: 50000, ev: 300000, bt: 320000, va: 300000, kvv: 20000 });
  const d = { id: 'h', soort: 'IKV', kader: 'OPT', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [holding, minder], ib: { 2023: { perOnd: { h1: { loon: 50000 } } }, 2024: { perOnd: { h1: { loon: 50000 } } }, 2025: { perOnd: { h1: { loon: 50000 } } } } };
  const r = bereken(d);
  const m = r.inkomen.optimaal.minderheidPerJaar;
  assert.equal(m[2025], 50000);
  assert.equal(r.inkomen.optimaal.lookPerJaar[2025], 0);
  assert.equal(r.toetsinkomen, 100000);
});

test('Vergelijking: één dossier, alle beschikbare toetskaders', () => {
  const v = vergelijkKaders(ezDossier({ kader: 'NHG', sfw: [30000, 40000, 60000] }));
  assert.equal(v.length, KADER_VOLGORDE.length);
  const per = Object.fromEntries(v.map((x) => [x.id, x.toetsinkomen]));
  assert.equal(per.NHG, 43333);
  assert.equal(per.KNAB, 47667);
  assert.equal(per.ASN, 43333);
  assert.ok(per.OPT > 0);
  assert.ok(v.every((x) => !x.fout));
});

test('Fix: herrubricering kort ↔ lang raakt het eigen vermogen niet; overig passiva kort wel (met signaal)', () => {
  const corr = (type) => ({ 2025: { vermogensCorrecties: [{ type, bedrag: 40000 }] } });
  const r1 = bereken({ id: 'x', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('a', 'A', {}, corr('herrubriceringKortLang'))] });
  const j1 = r1.ondernemingen[0].jaren[2025];
  assert.equal(j1.EVcor, 80000);
  assert.equal(j1.KVVcor, 10000);
  const r2 = bereken({ id: 'x', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('a', 'A', {}, corr('overigPassivaKort'))] });
  assert.equal(r2.ondernemingen[0].jaren[2025].EVcor, 120000);
  assert.ok(r2.meldingen.some((m) => /Herrubricering/.test(m.tekst)));
});

test('Fix: onmogelijke balans wordt niet akkoord', () => {
  const r = bereken({ id: 'x', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('a', 'A', {}, { 2025: { bzi: { omzet: 200000, nettowinst: 40000, ev: 300000, bt: 200000, va: 90000, kvv: 50000 } } })] });
  const c = r.ondernemingen[0].checks.find((x) => x.key === 'plausibel2025');
  assert.equal(c.status, 'niet_akkoord');
});

test('Fix: belang per jaar; een nieuwe aandeelhouder krijgt geen dividend uit eerdere jaren', () => {
  const kind = aggBV('k', 'Werk BV', { parentId: 'h1', aandeelPct: 25, extraParents: [{ id: 'h2', pct: 5, vanaf: 2026 }] }, {
    2025: { bzi: { omzet: 200000, nettowinst: 40000, ev: 80000, bt: 200000, va: 90000, kvv: 50000, internDividend: 100000 } } });
  const d = { id: 's', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('h1', 'Holding 1'), aggBV('h2', 'Holding 2', { startdatum: '2025-12-28' }), kind] };
  const st = structuur(d);
  const l = st.links.find((x) => x.ouder === 'h2');
  assert.equal(l.pctJaar(2025), 0);
  assert.equal(l.pctJaar(2026), 0.05);
  const bel = belangen(d, st);
  assert.equal(bel.get('k').belangJaar(2025), 0.25);
  assert.equal(bel.get('k').keten, false);
  const r = bereken(d);
  const gs = r.inkomen.geldstromen.find((x) => x.naar === 'h2' && x.soort === 'dividend');
  assert.ok(!gs || gs.perJaar[2025].betaald === 0);
});

test('Fix: een nieuwe holding met 0-inkomen zet het NHG-inkomen niet op € 0', () => {
  const d = { id: 'n', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {
    2023: { perOnd: { h1: { loon: 50000 } } }, 2024: { perOnd: { h1: { loon: 50000 } } }, 2025: { perOnd: { h1: { loon: 50000 } } } },
  ondernemingen: [aggBV('h1', 'Holding 1'), aggBV('h2', 'Nieuwe holding', { startdatum: '2025-12-28', nulInkomen: true }, {}, { omzet: 0, nettowinst: 0 })] };
  const r = bereken(d);
  assert.notEqual(r.status, 'niet_akkoord');
  assert.ok(r.vastgesteld > 0);
  assert.ok(r.inkomen.nietMeegenomen);
});

test('Fix: berekend inkomen BZI, dividend begrensd op de gemiddelde nettowinst × belang (ook bij verlies)', () => {
  const r = bereken(dgaDossier('ABN', { kosten: 145000, dividend: 40000 }));
  const o = r.inkomen.perHoofdbedrijf[0];
  // nettowinst: 200.000 - loon - 145.000 - 10.000 = -15.000 / -17.000 / -20.000 → gemiddeld -17.333
  assert.equal(o.gemNwBzi, -17333);
  assert.equal(o.bziDividend, -17333);
  assert.equal(o.berekend, o.bziInkomen - 17333);
});

test('Fix: holdingroute ABN telt ontvangen dividend uit een minderheidsdeelneming', () => {
  const minder = aggBV('m1', 'Minderheid BV', { parentId: 'h1', aandeelPct: 25 }, {
    2023: { bzi: { omzet: 1, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 400000 } },
    2024: { bzi: { omzet: 1, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 600000 } },
    2025: { bzi: { omzet: 1, nettowinst: 300000, ev: 900000, bt: 1500000, va: 700000, kvv: 300000, internDividend: 600000 } },
  });
  const holding = aggBV('h1', 'Holding BV', { holdingroute: true }, {}, { omzet: 0, nettowinst: -400, ev: 300000, bt: 320000, va: 300000, kvv: 20000 });
  const d = { id: 'h', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 },
    ondernemingen: [holding, minder], ib: { 2023: { perOnd: { h1: { loon: 54000 } } }, 2024: { perOnd: { h1: { loon: 55000 } } }, 2025: { perOnd: { h1: { loon: 55000 } } } } };
  const r = bereken(d);
  const b2 = r.ondernemingen[0].box2;
  assert.deepEqual(b2.holding.perJaar, { 2023: 100000, 2024: 150000, 2025: 150000 });
  assert.equal(b2.totaal, 133333);
  const h = r.inkomen.perHoofdbedrijf[0];
  assert.equal(h.woonbeleid, h.toets + 133333);
});

test('Fix: geen factuurmelding meer bij extra ondernemingen', () => {
  const d = dgaDossier('ABN');
  d.instellingen.initieelAantalOndernemingen = 0.5;
  const r = bereken(d);
  assert.ok(!r.meldingen.some((m) => /factuur/i.test(m.tekst)));
});

test('Signaal: nieuwe holding zonder inkomen die op de duur afketst krijgt het advies 0-inkomen', () => {
  const d = { id: 'n2', soort: 'IKV', kader: 'NHG', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {
    2023: { perOnd: { h1: { loon: 50000 } } }, 2024: { perOnd: { h1: { loon: 50000 } } }, 2025: { perOnd: { h1: { loon: 50000 } } } },
  ondernemingen: [aggBV('h1', 'Holding 1'), aggBV('h2', 'Nieuwe holding', { startdatum: '2025-12-28' }, {}, { omzet: 0, nettowinst: 0 })] };
  const r = bereken(d);
  assert.equal(r.status, 'niet_akkoord');
  assert.ok(r.meldingen.some((m) => /nulbesluit bij Fiattering/.test(m.tekst)));
});

test('Zeggenschap via twee eigen holdings samen (30% + 30%), inkomen alleen via de meegetelde holding', () => {
  const groep = aggBV('g', 'Groep BV', { parentId: 'h1', aandeelPct: 30, extraParents: [{ id: 'h2', pct: 30 }] });
  const d = { id: 'z', soort: 'IKV', kader: 'OPT', berekeningsdatum: '2026-07-15', instellingen: { laatsteToetsjaar: 2025 }, ib: {},
    ondernemingen: [aggBV('h1', 'Holding 1'), aggBV('h2', 'Holding 2', { nulInkomen: true }), groep] };
  const st = structuur(d);
  const bel = belangen(d, st, { telt: (id) => id !== 'h2', jaar: 2025 });
  assert.equal(bel.get('g').keten, true);
  assert.equal(bel.get('g').belangJaar(2025), 0.6);
  assert.equal(bel.get('g').belangInkomenJaar(2025), 0.3);
  const r = bereken(d);
  assert.equal(r.ondernemingen.find((a) => a.id === 'g').box2.model, 'OPT');
});
