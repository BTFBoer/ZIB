import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { renderInkomenTabel, renderOndernemingInkomen, renderRekenUitkomst } from '../public/js/views/rekenuitkomst.js';

test('Berekenresultaten tonen inkomen vóór ratio’s, met een link naar de bedrijfsberekening', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  const r = bereken(d);
  const h = renderRekenUitkomst(d, r);
  assert.match(h, /id="rekenresultaten-titel" tabindex="-1">Inkomen<.*Ratio’s en voorwaarden/s);
  assert.ok(h.includes(`#/dossier/${d.id}/berekening/${r.ondernemingen[0].id}`));
  assert.match(h, /Toetsinkomen totaal.*Nog te beoordelen.*Berekende indicatie/s);
  assert.doesNotMatch(h, /id="fiat-controles"|Overige aandachtspunten/);
});

test('Bedrijfsdetails tonen ingevoerde nul, maar laten ontbrekende winst en onvolledige balans open', () => {
  const d = { id: 'test', soort: 'IKV', kader: 'ABN', berekeningsdatum: '2026-09-15', ondernemingen: [{
    id: 'o', naam: 'Testbedrijf', rechtsvorm: 'EZ', startdatum: '2018-01-01', land: 'NL',
    jaren: { 2023: { bzi: { nettowinst: 0, va: 1000, kvv: 500 } }, 2024: { bzi: { va: 1000 } }, 2025: { bzi: { nettowinst: 95000, bt: 2000, ev: 1000 } } },
  }] };
  const r = bereken(d);
  const h = renderOndernemingInkomen(d, r, r.ondernemingen[0]);
  assert.match(h, /Box 1 inkomen<\/th><td class="num">€ 0<\/td><td class="num">—<\/td><td class="num">€ 95\.000/);
  assert.match(h, /Liquiditeit · Current ratio<\/th>\s*<td class="num">2,00<\/td><td class="num">—<\/td>/);
  assert.match(h, /Solvabiliteit<\/th>\s*<td class="num">—<\/td><td class="num">—<\/td><td class="num">50,00%/);
  assert.match(h, /Trend winstgevendheid.*Omlooptijd crediteuren \(dagen\)/s);
});

test('De ABN-bronmethode verschijnt onder het formele, open toetsinkomen', () => {
  const d = { ...beleidsvoorbeeldVoor('VENN'), kader: 'ABN' };
  const r = bereken(d);
  r.toetsinkomen = null;
  r.vastgesteld = null;
  r.inkomen.abnVaststelling = { methode: 'verticaal', bedrag: 192908.33, bron: 'herberekend' };
  assert.match(renderInkomenTabel(d, r), /Toetsinkomen totaal.*Nog te beoordelen.*ABN AMRO · Verticaal · Herberekend.*192\.908,33/s);
});
