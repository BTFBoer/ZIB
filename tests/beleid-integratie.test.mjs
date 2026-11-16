import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { demoRecords } from '../public/js/data/demo.js';
import { renderDossier } from '../public/js/views/dossier.js';
import { renderToetskaders } from '../public/js/views/paginas.js';

const voorbeeld = (kader) => demoRecords().find((d) => d.id === `dos_demo_beleid_${kader.toLowerCase()}`);

test('Beleid: dezelfde fictieve cijfers leveren verschillende herleidbare bedragen op', () => {
  const v = bereken(voorbeeld('VENN'));
  const i = bereken(voorbeeld('ING'));
  assert.equal(v.beleid.indicatie, 91900);
  assert.equal(i.beleid.indicatie, 95500);
  assert.ok(v.trace.secties.some((s) => s.groep === 'inkomen' && s.titel.includes('Venn')));
  assert.match(renderDossier(voorbeeld('VENN'), 'rapport', '', v), /Voorlopige rekenindicatie/);
  assert.match(renderToetskaders(), /data-beleid-zoek/);
});

test('Beleid: Rabobank-indicatie blijft apart van een ontbrekende of geregistreerde IKV', () => {
  const d = voorbeeld('RABO');
  let r = bereken(d);
  assert.equal(r.bron, 'open');
  assert.equal(r.beleid.indicatie, 91050);
  assert.ok(r.documenten.some((x) => x.categorie === 'ikv'));
  Object.assign(d.beleidsinvoer.RABO, { ikvBedrag: 91000, ikvDatum: '2026-11-02', ikvOpsteller: 'Rabobank' });
  r = bereken(d);
  assert.equal(r.bron, 'verklaring');
  assert.equal(r.beleid.bedrag, 91000);
  assert.equal(r.beleid.indicatie, 91050);
  assert.match(renderDossier(d, 'rapport', '', r), /Eigen rekenindicatie:<\/b> € 91\.050/);
  d.beleidsinvoer.RABO.ikvDatum = '2026-11-31';
  assert.equal(bereken(d).beleid.bedrag, null);
});

test('Beleid: zonder verklaring blijft NIBC open bij wisselen tussen standaard en 1-2-3', () => {
  const d = voorbeeld('NIBC');
  assert.equal(bereken(d).beleid.indicatie, 94150);
  d.beleidsinvoer.NIBC.nibcMethode = 'standaard';
  const r = bereken(d);
  assert.equal(r.beleid.indicatie, 92550);
  assert.equal(r.beleid.bedrag, null);
});
