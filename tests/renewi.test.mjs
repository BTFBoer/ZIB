// Oefendossier Renewi Limited (echte jaarcijfers, fictieve aanvrager): aansluiting met de jaarrekeningen
// en de uitkomst per toetskader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewiRecords } from '../public/js/data/demo-renewi.js';
import { demoRecords } from '../public/js/data/demo.js';
import { balansTotalen, vwTotalen } from '../public/js/engine/financieel.js';
import { bereken, vergelijkKaders } from '../public/js/engine/index.js';
import { BASIS_KADERS } from '../public/js/engine/kaders.js';

const dossier = () => structuredClone(renewiRecords()[0]);

test('Renewi: balans en resultaat sluiten aan op de geconsolideerde jaarrekeningen', () => {
  const o = dossier().ondernemingen[0];
  // jaar = boekjaar dat in dat kalenderjaar begint; bedragen in euro's
  const bron = {
    2023: { TA: 2056200e3, EV: 314000e3, VA: 493800e3, KVV: 900000e3, NW: -30900e3 },
    2024: { TA: 1856000e3, EV: 325500e3, VA: 300100e3, KVV: 674000e3, NW: 3300e3 },
    2025: { TA: 1987300e3, EV: 688700e3, VA: 408100e3, KVV: 560300e3, NW: -11800e3 },
  };
  for (const [y, v] of Object.entries(bron)) {
    const j = o.jaren[y];
    const b = balansTotalen(j.balans);
    const w = vwTotalen(j.vw);
    assert.equal(b.TA, v.TA, `balanstotaal ${y}`);
    assert.equal(b.VERSCHIL, 0, `activa = passiva ${y}`);
    assert.equal(b.EV, v.EV, `groepsvermogen ${y}`);
    assert.equal(b.VA, v.VA, `vlottende activa ${y}`);
    assert.equal(b.KVV, v.KVV, `kortlopende schulden ${y}`);
    assert.equal(w.NW, v.NW, `resultaat na belastingen ${y}`);
    for (const [post, det] of Object.entries(j.balansDetail || {})) {
      assert.equal(Object.values(det).reduce((s, x) => s + x, 0), j.balans[post], `detail ${post} ${y}`);
    }
  }
});

test('Renewi: gebroken boekjaar zonder waarschuwing voor een kort boekjaar', () => {
  const r = bereken(dossier());
  assert.deepEqual(r.T, [2023, 2024, 2025]);
  const a = r.ondernemingen[0];
  assert.ok(!a.checks.some((c) => c.key?.startsWith('kort') || /korter dan 12 maanden/.test(c.label)));
  assert.equal(a.jaren[2025].van, '2025-04-01');
});

test('Renewi: correcties na belastingen geven de nettowinst toe te rekenen aan de aandeelhouder na eenmalige posten', () => {
  const a = bereken(dossier()).ondernemingen[0];
  assert.equal(a.jaren[2023].winst.NWcor, 37600000);
  assert.equal(a.jaren[2024].winst.NWcor, 30125000);
  assert.equal(a.jaren[2025].winst.NWcor, -5100000);
});

test('Renewi: alle vijf basiskaders niet akkoord (buitenland, verlies laatste jaar, solvabiliteit, liquiditeit)', () => {
  const v = vergelijkKaders(dossier(), BASIS_KADERS);
  assert.equal(v.length, 5);
  v.forEach((x) => {
    assert.ok(!x.fout, `${x.kort}: ${x.fout}`);
    assert.equal(x.status, 'niet_akkoord', x.kort);
    assert.equal(x.vastgesteld, 0, x.kort);
    assert.ok(x.nok.some((t) => /Buitenland/.test(t)), `${x.kort}: buitenland`);
  });
  const nhg = v.find((x) => x.id === 'NHG');
  assert.equal(nhg.box1, 392600); // gemiddeld DGA-loon, bijtelling alleen in het laatste jaar
  assert.equal(nhg.box2, 0);
});

test('Renewi (ABN AMRO): rekentool berekent loon + dividend; de acceptant geeft geen inkomen af', () => {
  const d = dossier();
  const r = bereken(d);
  const h = r.inkomen.perHoofdbedrijf[0];
  assert.equal(h.bziInkomen, 386200);
  assert.equal(h.bziDividend, 4566667); // gemiddeld dividend, onder de gemiddelde nettowinst × belang
  assert.equal(r.berekend, 4952867);
  assert.equal(r.toetsinkomen, 386200);
  assert.equal(h.bron, 'geen');
  assert.equal(r.bron, 'geen');
  assert.equal(r.vastgesteld, 0);
  // Zonder het besluit blijft het berekend inkomen staan (zoals in de rekentool van de bank)
  d.ondernemingen[0].geenInkomen = false;
  const r2 = bereken(d);
  assert.equal(r2.bron, 'berekend');
  assert.equal(r2.vastgesteld, 4952867);
  assert.equal(r2.status, 'niet_akkoord');
});

test('Renewi: demodossier, documenten en taken staan in de demogegevens', () => {
  const recs = demoRecords();
  assert.ok(recs.some((x) => x.id === 'dos_demo_renewi' && x.nummer === 'ZIB-2026-0103'));
  assert.equal(recs.filter((x) => x.type === 'document' && x.dossierId === 'dos_demo_renewi').length, 8);
  assert.ok(recs.some((x) => x.type === 'taak' && x.dossierId === 'dos_demo_renewi'));
  const ids = recs.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'unieke id\'s');
});
