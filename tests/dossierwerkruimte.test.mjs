import test from 'node:test';
import assert from 'node:assert/strict';
import { bereken } from '../public/js/engine/index.js';
import { beleidsvoorbeeldVoor } from '../public/js/data/demo.js';
import { renderDossier, TABS } from '../public/js/views/dossier.js';

test('Berekening en Fiattering delen de uitkomstentabel, en de controles staan bij Fiattering', () => {
  const d = beleidsvoorbeeldVoor('VENN');
  const r = bereken(d);
  const start = renderDossier(d, 'berekening', '', r);
  assert.match(start, /Algemene rekenkeuzes[\s\S]*data-actie="dossier-berekenen"/);
  assert.doesNotMatch(start, /data-uitkomstentabel/);
  const berekening = renderDossier(d, 'berekening', '', r, { berekend: true });
  const fiat = renderDossier(d, 'fiat', '', r);
  assert.ok(berekening.includes('data-uitkomstentabel'));
  assert.match(berekening, /Algemene rekenkeuzes[\s\S]*>Inkomen<\/h2>[\s\S]*Ratio’s en voorwaarden/);
  assert.ok(fiat.includes(berekening.match(/<table[^>]+data-uitkomstentabel\b[^>]*>[\s\S]*?<\/table>/)[0]));
  assert.doesNotMatch(berekening, /id="fiat-controles"|id="reken-invoer"|Overige aandachtspunten/);
  assert.match(fiat, /id="fiat-controles"/);
  assert.match(fiat, /id="reken-invoer"/);
  assert.doesNotMatch(renderDossier(d, 'notities', '', r), /Maatschappijspecifieke controles/);
  const a = d.ondernemingen[0];
  assert.ok(berekening.includes(`#/dossier/${d.id}/berekening/${a.id}`));
  assert.match(renderDossier(d, 'berekening', a.id, r), /Alle uitkomsten.*Inkomen, ratio’s en voorwaarden.*Rekenstappen/s);
});

test('Elke dossiertab heeft een opslagactie in ViiZ en BZI', () => {
  const dossier = beleidsvoorbeeldVoor('VENN');
  for (const [tab] of TABS) assert.match(renderDossier(dossier, tab, '', bereken(dossier)), /data-actie="dossier-opslaan"/, tab);
  const d = { ...dossier, kader: 'ABN', weergave: 'bzi' };
  for (const tab of ['algemeen', 'bedrijven', 'bedrijf', 'verplichtingen', 'samenvatting', 'berekening', 'fiat']) {
    assert.match(renderDossier(d, tab, '', bereken(d)), /data-actie="dossier-opslaan"/, tab);
  }
});
