import test from 'node:test';
import assert from 'node:assert/strict';
import { leesKerncijfers, leesKernbedrag } from '../public/js/schema/kernimport.js';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { bereken } from '../public/js/engine/index.js';
import { renderDossier } from '../public/js/views/dossier.js';
import { heeftControleperiode } from '../public/js/views/kerninvoer.js';

test('Excel-invoer volgt de post en het jaar; alleen echte cijfers, inclusief nul, worden overgenomen', () => {
  const velden = [2024, 2025].map((jaar) => ({ post: 'Saldo fiscale winst', jaar, bind: `ib.${jaar}.perOnd.ond.sfw` }));
  const csv = '\uFEFFPost;2025;2024;2026\r\n"Saldo fiscale winst";"0";"(€ 1.234,56)";500\r\nAndere post;1;;\r\n';
  const result = leesKerncijfers(csv, velden);
  assert.deepEqual(result.posten.map(({ bind, waarde }) => [bind, waarde]), [['ib.2025.perOnd.ond.sfw', 0], ['ib.2024.perOnd.ond.sfw', -1234.56]]);
  assert.equal(result.meldingen.length, 2);
  assert.equal(leesKerncijfers('Post\t2025\t2025\nSaldo fiscale winst\t1000\t2000', velden).posten.length, 0);
  assert.equal(leesKerncijfers('Post\t2025\nSaldo fiscale winst\t1000\nSaldo fiscale winst\t2000', velden).posten.length, 0);
  assert.equal(leesKernbedrag('12.50'), null);
  assert.equal(leesKernbedrag('1E4'), null);
  assert.equal(leesKerncijfers('Post\t2025\t2024\nSaldo fiscale winst\t\t2000', velden).posten[0].jaar, 2024);
});

test('Invoerblad gebruikt de rekenvelden, maakt reeds geboekte details alleen-lezen en opent het controlejaar pas met een geldige periode', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  const o = d.ondernemingen[0];
  delete o.jaren[2025].vw;
  delete o.jaren[2026].vw;
  const uitkomst = bereken(d);
  let html = renderDossier(d, 'invoer', o.id, uitkomst);
  assert.ok(html.includes(`data-bind="ib.2025.perOnd.${o.id}.sfw"`));
  assert.ok(html.includes(`data-bind="ond:${o.id}.jaren.2025.bzi.nettowinst"`));
  assert.equal(heeftControleperiode({ tot: '2026-10-01' }, 2026, '2026-09-01'), false);
  assert.equal(heeftControleperiode({ van: '2026-05-01', tot: '2026-04-30' }, 2026, '2026-09-01'), false);
  delete o.jaren[2026].tot;
  o.jaren[2025].balans = { liquideMiddelen: 100000, evKapitaal: 100000 };
  html = renderDossier(d, 'invoer', o.id, bereken(d));
  assert.match(html, /Vul de einddatum van de controleperiode in/);
  assert.match(html, /disabled title="Vul eerst de einddatum van de controleperiode in"[^>]*aria-label="Nettowinst 2026"/);
  assert.ok(!html.includes(`data-bind="ond:${o.id}.jaren.2025.bzi.ev"`));
  assert.match(html, /Uit detailposten/);
});
