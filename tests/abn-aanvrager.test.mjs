import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';

const jaren = [2023, 2024, 2025];
const perJaar = (fn) => Object.fromEntries(jaren.map((y, i) => [y, fn(i)]));
const boekjaar = (winst, extra = {}) => ({ status: 'definitief', bzi: { omzet: 100000, nettowinst: winst,
  ev: 120000, bt: 180000, va: 60000, kvv: 20000, afschrijvingen: 0, ...extra } });
const bv = (id, vast = {}) => ({ id, naam: id, rechtsvorm: 'BV', land: 'NL', aandeelPct: 100, startdatum: '2018-01-01',
  jaren: perJaar(() => boekjaar(30000)), ...vast });

function dossier() {
  const gezamenlijkeLonen = [60000, 64000, 61000];
  return { type: 'dossier', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-09-15',
    ondernemingen: [bv('A'), bv('B')], ib: perJaar((i) => ({ dgaGezamenlijk: { loon: gezamenlijkeLonen[i], bijtelling: -1000 } })) };
}

test('Gezamenlijk ABN-loon wordt eenmaal geteld en alleen over afgesloten jaren gemiddeld', () => {
  const d = dossier();
  d.ib[2026] = { dgaGezamenlijk: { loon: 35000, bijtelling: 1000, van: '2026-01-01', tot: '2026-06-30' } };
  let r = bereken(d);
  assert.equal(r.inkomen.dgaGezamenlijk.inUitkomst, true);
  assert.equal(r.inkomen.box1, 60667);
  assert.equal(r.toetsinkomen, 60000);
  assert.equal(r.inkomen.dgaGezamenlijk.perJaar[2026].geëxtrapoleerd, 68000);

  for (const y of jaren) d.ib[y].perOnd = { A: { loon: 30000, bijtelling: 1000 }, B: { loon: d.ib[y].dgaGezamenlijk.loon - 30000 } };
  r = bereken(d);
  assert.equal(r.inkomen.box1, 60667, 'de IB-loonuitsplitsing bevestigt dezelfde loonpost en telt dus niet nog eens mee');
  d.ib[2025].perOnd.B.loon += 1;
  r = bereken(d);
  assert.equal(r.inkomen.dgaGezamenlijk.inUitkomst, false);
  assert.equal(r.toetsinkomen, null);
  assert.equal(r.vastgesteld, null);
  assert.match(r.inkomen.dgaGezamenlijk.blokkades.join(' '), /wijkt af van de uitsplitsing/);
});

test('De groepsvergelijking begrenst ontvangen minderheidsdividend en toont de horizontale werkbladuitkomst afzonderlijk', () => {
  const d = dossier();
  d.abnGroep = { minderheidsdividendInWinst: true, nettowinstExclusiefDeelnemingen: true, overwinstMeenemen: true, uitkeringsruimteMaximeren: true };
  const [houder, nieuw] = d.ondernemingen;
  nieuw.startdatum = '2025-12-31';
  nieuw.jaren = { 2025: boekjaar(0, { ev: 20000, bt: 20000, va: 0, kvv: 0 }) };
  houder.jaren = perJaar((i) => ({ ...boekjaar([10000, 15000, 20000][i]), geldstromen: {
    totaalOntvangenDividend: [19000, 17000, 25000][i], totaalOntvangenFee: 80000, dividendPriveBruto: [5000, 7000, 8000][i],
  } }));
  d.ondernemingen.push(bv('Minderheid', { parentId: houder.id, aandeelPct: 25, meenemen: false,
    jaren: perJaar(() => boekjaar(50000, { internDividend: 80000 })) }));
  let r = bereken(d);
  const bron = r.inkomen.abnBronVergelijking;
  assert.equal(r.vastgesteld, null, 'de groepsvergelijking vervangt het officiële inkomen niet');
  assert.deepEqual(bron.open, []);
  assert.deepEqual(jaren.map((y) => bron.perJaar[y].minderheidsdividend), [19000, 17000, 20000]);
  assert.equal(bron.dga, 60000);
  assert.equal(bron.uitgekeerd, 6666.67);
  assert.equal(bron.nietUitgekeerd, 27000);
  assert.equal(bron.uitkeringsruimte, 40000);
  assert.equal(bron.horizontaal, 93666.67);
  assert.ok(!r.inkomen.geldstromen.some((s) => s.naar === houder.id && s.perJaar[2025].ontvangen === 25000));

  d.ondernemingen.push(bv('Meerderheid', { parentId: houder.id, aandeelPct: 100, jaren: perJaar(() => boekjaar(20000, { internDividend: 40000 })) }));
  r = bereken(d);
  assert.equal(r.inkomen.abnBronVergelijking.horizontaal, null);
  assert.match(r.inkomen.abnBronVergelijking.open.join(' '), /vraagt een aansluiting/);
});
