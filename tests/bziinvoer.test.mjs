import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { bziVerschil, maakBziCsv, renderBziInvoer } from '../public/js/views/bziinvoer.js';
import { ui } from '../public/js/views/uistate.js';

function voorbeeld() {
  // Fictief v7.2-werkboek, Overzicht C6:E7, C33:E33 en C35:E35. De berekende
  // groepswinst is hier één totaalpost om alleen de inkomensstap te testen.
  const jaren = {};
  const ib = {};
  [2023, 2024, 2025].forEach((y, i) => {
    jaren[y] = { bzi: { omzet: 400000, nettowinst: [169920, 193350, 201500][i], ev: 1000000, bt: 1500000, va: 600000, kvv: 150000 } };
    ib[y] = { perOnd: { bv: { loon: [80000, 82000, 72000][i], bijtelling: [6200, 6200, 6400][i], dividend: [50000, 50000, 70000][i] } } };
  });
  return { soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-10-28', instellingen: { laatsteToetsjaar: 2025 }, ib,
    ondernemingen: [{ id: 'bv', naam: 'Fictieve Holding', rechtsvorm: 'BV', startdatum: '2016-01-01', aandeelPct: 100,
      jaren, overwinst: { meenemen: true, kasstroomBevestigd: true } }] };
}

test('BZI-vergelijking: werkboekbedragen voor indicatie en Woonbeleid, uitkomst bank blijft apart', () => {
  const d = voorbeeld();
  const r = bereken(d);
  assert.equal(r.berekend, 128400);
  assert.equal(r.toetsinkomen, 253767);
  assert.match(renderBziInvoer(d, r), /Nog te vergelijken/);

  d.ondernemingen[0].bziWerkelijk = 0;
  const metBzi = bereken(d);
  assert.equal(metBzi.berekend, r.berekend);
  assert.equal(metBzi.toetsinkomen, r.toetsinkomen);
  assert.equal(metBzi.vastgesteld, r.vastgesteld);
  assert.match(renderBziInvoer(d, metBzi), /− € 128\.400 t\.o\.v\. ZIB/);
  assert.equal(bziVerschil(128400, 128400), 'Gelijk aan ZIB');
});

test('BZI-export: numerieke bedragen, veilige tekst en het juiste belang per boekjaar', () => {
  const d = voorbeeld();
  const hoofd = d.ondernemingen[0];
  hoofd.naam = '=1+1; "Holding"';
  d.ondernemingen.push({ ...hoofd, id: 'kind', naam: 'Voorbeeld B.V.', parentId: hoofd.id, aandeelPct: 50,
    jaren: Object.fromEntries([2023, 2024, 2025].map((y, i) => [y, { aandeelPct: [25, 40, 50][i], bzi: { ...hoofd.jaren[y].bzi, internDividend: 10000 } }])) });
  const csv = maakBziCsv(d, bereken(d));
  assert.ok(csv.startsWith('\uFEFF"Onderneming";"Onderdeel";"Veld in de rekentool";2025;2024;2023\r\n'));
  assert.ok(csv.includes(`"'=1+1; ""Holding"" (hoofdbedrijf)"`));
  assert.match(csv, /"Bijtelling privégebruik auto \(negatief\)";-6400;-6200;-6200\r\n/);
  assert.match(csv, /"Intern dividend [^\r\n]+;5000;4000;2500\r\n/);

  const richting = ui.jaarVolgorde;
  try {
    ui.jaarVolgorde = 'oud';
    assert.match(maakBziCsv(d, bereken(d)), /"Veld in de rekentool";2023;2024;2025\r\n/);
  } finally {
    ui.jaarVolgorde = richting;
  }
});
