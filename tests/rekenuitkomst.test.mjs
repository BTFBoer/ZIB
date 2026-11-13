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
  // Het totaal toont altijd het berekende bedrag; de aard van het bedrag staat eronder.
  assert.match(h, /Toetsinkomen totaal.*reken-uitkomstbedrag"><strong>€ [\d.]+<\/strong><small>Indicatie/s);
  assert.doesNotMatch(h, /Nog te (beoordelen|bepalen)/);
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

test('De gekozen ABN-bronmethode staat als vastgesteld inkomen onder het toetsinkomen volgens Woonbeleid', () => {
  const d = { ...beleidsvoorbeeldVoor('VENN'), kader: 'ABN' };
  const r = bereken(d);
  r.vastgesteld = 192908.33;
  r.inkomen.abnVaststelling = { methode: 'verticaal', bedrag: 192908.33, bron: 'herberekend', horizontaal: 181250.5, verticaal: 192908.33 };
  const h = renderInkomenTabel(d, r);
  assert.match(h, /Toetsinkomen volgens Woonbeleid.*Vastgesteld inkomen · ABN AMRO · verticaal · herberekend.*192\.908,33/s);
  assert.doesNotMatch(h, /Nog te (beoordelen|bepalen)/);

  // Zonder berekenbaar toetsinkomen blijft de herberekende methode zichtbaar.
  r.toetsinkomen = null;
  r.vastgesteld = null;
  assert.match(renderInkomenTabel(d, r), /Geen cijfers.*ABN AMRO · verticaal · herberekend.*192\.908,33/s);
});

test('Een vervangen beletjaar staat als eigen regel tussen de ondernemingen en het totaal', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  d.kader = 'KNAB';
  d.instellingen = { ...d.instellingen, belet: { actief: true, jaar: 2024, oorzaak: 'Ziekte', motivatie: 'Verklaring boekhouder' } };
  d.ib[2024].perOnd[d.ondernemingen[0].id].sfw = 30000;
  const r = bereken(d);
  const { oud, nieuw } = r.inkomen.belet;
  assert.ok(nieuw > oud, 'het beletjaar wordt vervangen door het laagste omliggende jaar');
  assert.equal(r.inkomen.perJaar[2024], nieuw);
  const h = renderInkomenTabel(d, r);
  assert.match(h, /class="reken-aanpassing"><th scope="row">Beletperiode 2024 vervangen/);
  assert.ok(h.includes(`€ ${new Intl.NumberFormat('nl-NL').format(nieuw - oud)}`), 'de regel toont het verschil in het beletjaar');
});
